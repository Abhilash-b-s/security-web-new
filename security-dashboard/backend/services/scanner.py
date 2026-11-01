import asyncio
from collections import deque
import json
import os
from datetime import datetime
from routers.settings import load_registries, trivy_login
import uuid
from fastapi import WebSocket
from models import ScanRequest, ScanType, ScanStatus, ScanResult

# Scan types that run Trivy against images or cluster workloads and so need registry logins.
IMAGE_SCANS = {ScanType.TRIVY_IMAGE, ScanType.TRIVY_CLUSTER, ScanType.TRIVY_SBOM, ScanType.TRIVY_COMPLIANCE}


def registry_host(url: str) -> str:
    """Saved registry URL -> host as it appears in image refs (https://quay.io/ -> quay.io)."""
    host = (url or "").split("://", 1)[-1].split("/", 1)[0].lower()
    return "docker.io" if host in ("index.docker.io", "registry-1.docker.io") else host
from services.history import record_snapshot
from services import runs_store, clusters, scan_control
from services.cluster_context import LOCAL, REMOTE_SCANS, scan_env
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("uvicorn")

REPORTS_DIR = "security-dashboard/backend/reports"
os.makedirs(REPORTS_DIR, exist_ok=True)

MAX_BUFFERED_LINES = 20000  # per scan; oldest output is dropped beyond this


class ConnectionManager:
    """Fans scan output out to WebSockets and keeps the output of running scans
    in memory, so a client that connects mid-scan gets the whole run replayed."""

    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}
        self.runs: dict[str, dict] = {}  # scan_id -> {scan_id, scan_type, started_at, lines}
        # Serialises replay and broadcast so a joining client never misses or reorders lines.
        self.lock = asyncio.Lock()

    def start_run(self, scan_id: str, scan_type: str):
        self.runs[scan_id] = {
            "scan_id": scan_id,
            "scan_type": scan_type,
            "started_at": datetime.now().isoformat(),
            "lines": deque(maxlen=MAX_BUFFERED_LINES),
        }

    def end_run(self, scan_id: str):
        self.runs.pop(scan_id, None)

    def list_runs(self):
        return [{k: v for k, v in r.items() if k != "lines"} | {"lines": len(r["lines"])} for r in self.runs.values()]

    async def connect(self, websocket: WebSocket, scan_id: str):
        await websocket.accept()
        logger.info(f"WS Connected: {scan_id}")
        async with self.lock:
            run = self.runs.get(scan_id)
            if run:
                for line in list(run["lines"]):
                    await websocket.send_text(line)
            elif runs_store.has_run(scan_id):
                # Scan already finished: tell the client straight away instead of leaving it waiting.
                await websocket.send_text("__EOF__")
            self.active_connections.setdefault(scan_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, scan_id: str):
        logger.info(f"WS Disconnected: {scan_id}")
        if scan_id in self.active_connections:
            if websocket in self.active_connections[scan_id]:
                self.active_connections[scan_id].remove(websocket)
            if not self.active_connections[scan_id]:
                del self.active_connections[scan_id]

    async def broadcast(self, message: str, scan_id: str):
        async with self.lock:
            run = self.runs.get(scan_id)
            if run is not None and message != "__EOF__":
                run["lines"].append(message)
            for connection in list(self.active_connections.get(scan_id, [])):
                try:
                    await connection.send_text(message)
                except Exception as e:
                    logger.error(f"Error broadcasting to {scan_id}: {e}")

manager = ConnectionManager()

async def handle_websocket(websocket: WebSocket, scan_id: str):
    logger.info(f"Handling WS connection for {scan_id}")
    await manager.connect(websocket, scan_id)
    try:
        while True:
            data = await websocket.receive_text()
            logger.info(f"Received WS data from {scan_id}: {data}")
    except Exception as e:
        logger.error(f"WS Error {scan_id}: {e}")
    finally:
        manager.disconnect(websocket, scan_id)

async def _run_command(command: list, scan_id: str, accum_output: list, cwd: str = None, env: dict = None):
    cmd_str = " ".join(command)
    # await manager.broadcast(f"\n$ {cmd_str}\n", scan_id)

    try:
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=cwd,
            env=env,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            start_new_session=True,  # own process group, so Stop can kill the script and its children
        )
        scan_control.register(scan_id, process)

        # Read line by line for smoother output
        buffer = ""
        while True:
            # Read larger chunks to get complete lines (1KB instead of 128 bytes)
            data = await process.stdout.read(1024)
            if not data:
                break

            text = data.decode('utf-8', errors='replace')
            buffer += text

            # Send complete lines immediately
            while '\n' in buffer:
                line, buffer = buffer.split('\n', 1)
                # Only send non-empty lines
                if line.strip():
                    await manager.broadcast(line + '\n', scan_id)
                    accum_output.append(line + '\n')

        # Send any remaining data
        if buffer.strip():
            await manager.broadcast(buffer, scan_id)
            accum_output.append(buffer)

        await process.wait()
        scan_control.unregister(scan_id, process)
        return process.returncode
    except FileNotFoundError:
        err = f"Error: Command not found: {command[0]}\n"
        await manager.broadcast(err, scan_id)
        accum_output.append(err)
        return 1
    except Exception as e:
        err = f"Error executing command: {str(e)}\n"
        await manager.broadcast(err, scan_id)
        accum_output.append(err)
        return 1

async def run_single_scan(scan_type: ScanType, scan_id: str, request: ScanRequest) -> dict:
    command = []
    # Mocking commands for demonstration if tools aren't installed, 
    # but implementing as if they are.
    # User /app in container, or fallback to current dir
    # User /app in container, or fallback to current dir
    cwd = os.getenv("APP_HOME", "/app") 
    
    # Prepare environment
    env = scan_env(os.environ.copy(), request.cluster)
    
    if scan_type == ScanType.KUBE_BENCH:
        command = ["bash", f"{cwd}/4_run_kube_bench.sh"]

    elif scan_type == ScanType.KYVERNO:
        command = ["bash", f"{cwd}/6_run_kyverno.sh"]
    
    elif scan_type == ScanType.TRIVY_IMAGE:
        command = ["bash", f"{cwd}/2_run_trivy_image.sh"]

    elif scan_type == ScanType.TRIVY_SBOM:
        command = ["bash", f"{cwd}/1_run_trivy_sbom.sh"]
    
    elif scan_type == ScanType.TRIVY_CLUSTER:
        command = ["bash", f"{cwd}/5_run_trivy_cluster.sh"]

    elif scan_type == ScanType.TRIVY_COMPLIANCE:
        command = ["bash", f"{cwd}/8_run_trivy_compliance.sh"]

    elif scan_type == ScanType.NMAP:
        command = ["bash", f"{cwd}/3_run_nmap.sh"]

    elif scan_type == ScanType.TRIVY_REPO:
        # Load Git Config
        # Import inside function or at top - ensure imported
        from routers.settings import load_git_config
        git_config = load_git_config()
        
        if not git_config.username or not git_config.token or not git_config.repos:
            await manager.broadcast("Error: Git configuration missing (User, Token, or Repos). Configure in Settings.\n", scan_id)
            return {
                "scan_type": scan_type,
                "status": ScanStatus.FAILED,
                "output": "Git configuration missing",
                "timestamp": datetime.now().isoformat()
            }
        
        # Write repos.txt
        repos_file = os.path.join(cwd, "repos.txt")
        try:
             repo_list = [r.strip() for r in git_config.repos.split('\n') if r.strip()]
             with open(repos_file, "w") as f:
                 for r in repo_list:
                     f.write(f"{r}\n")
        except Exception as e:
             await manager.broadcast(f"Error writing repos.txt: {e}\n", scan_id)
             return {
                "scan_type": scan_type,
                "status": ScanStatus.FAILED,
                "output": f"Error writing repos.txt: {e}",
                "timestamp": datetime.now().isoformat()
            }

        # Set env vars for the script
        env["GIT_USER"] = git_config.username
        env["GIT_TOKEN"] = git_config.token
        command = ["bash", f"{cwd}/7_run_trivy_repo.sh"]

    accum_output = []
    
    accum_output = []
    
    # env is already initialized at the top
    
    # Scans that pull images log in to every saved registry first. Each registry is independent:
    # images from registries that logged in are scanned; images from a failed one are skipped.
    if scan_type in IMAGE_SCANS and (stored_regs := load_registries()):
        await manager.broadcast("--- Authenticating with configured registries ---\n", scan_id)
        failed = []
        for reg in stored_regs:
            r_url, r_user = reg.get("url"), reg.get("username")
            ok, msg = await trivy_login(r_url, r_user, reg.get("password"), env)
            line = f"Logged into {r_url} as {r_user}" if ok else f"FAILED: login to {r_url} as {r_user}: {msg}"
            await manager.broadcast(line + "\n", scan_id)
            accum_output.append(line + "\n")
            if not ok:
                failed.append(registry_host(r_url))
        if failed:
            env["FAILED_REGISTRIES"] = " ".join(failed)
            note = (f"Images from {', '.join(failed)} will be skipped; other registries continue.\n"
                    if scan_type == ScanType.TRIVY_IMAGE else
                    f"Images from {', '.join(failed)} cannot be pulled; expect errors for them in this scan.\n")
            await manager.broadcast(note, scan_id)
            accum_output.append(note)
        await manager.broadcast("---------------------------------------------\n", scan_id)

    await manager.broadcast(f"--- Starting {scan_type.value} scan ---\n", scan_id)
    ret_code = await _run_command(command, scan_id, accum_output, cwd=cwd, env=env)
    
    if scan_control.is_cancelled(scan_id):
        status = ScanStatus.CANCELLED
    else:
        status = ScanStatus.COMPLETED if ret_code == 0 else ScanStatus.FAILED
    await manager.broadcast(f"--- {scan_type.value} scan finished with status: {status.value} ---\n", scan_id)
    
    return {
        "scan_type": scan_type,
        "status": status,
        "output": "".join(accum_output),
        "timestamp": datetime.now().isoformat()
    }

async def run_scan_task(scan_id: str, request: ScanRequest):
    results = []
    if scan_id not in manager.runs:
        manager.start_run(scan_id, request.scan_type.value)
    try:
        if request.scan_type == ScanType.ALL:

            # Scans picked in Settings → Full scan (every scan by default).
            from routers.settings import load_git_config, load_full_scan
            scans_to_run = load_full_scan()
            if request.cluster != LOCAL:
                skipped = [s for s in scans_to_run if s.value not in REMOTE_SCANS]
                scans_to_run = [s for s in scans_to_run if s.value in REMOTE_SCANS]
                if skipped:
                    await manager.broadcast(f"Skipping {', '.join(s.value for s in skipped)}: local cluster only, not run against '{request.cluster}'.\n", scan_id)
            await manager.broadcast(f"Full scan includes: {', '.join(s.value for s in scans_to_run)}\n", scan_id)
            # Source code runs only once Git settings are complete in Settings.
            git = load_git_config()
            if ScanType.TRIVY_REPO in scans_to_run and not (git.username and git.token and any(r.strip() and not r.strip().startswith('#') for r in (git.repos or '').split('\n'))):
                scans_to_run.remove(ScanType.TRIVY_REPO)
                await manager.broadcast("Skipping source code scan: Git repositories are not configured in Settings.\n", scan_id)
            for s_type in scans_to_run:
                if scan_control.is_cancelled(scan_id):
                    break
                res = await run_single_scan(s_type, scan_id, request)
                results.append(res)
        else:
            res = await run_single_scan(request.scan_type, scan_id, request)
            results.append(res)

        # Save Report
        final_report = {
            "id": scan_id,
            "request": request.dict(),
            "timestamp": datetime.now().isoformat(),
            "results": results
        }
    
        cluster = getattr(request, "cluster", "local")
        runs_store.save_run(final_report, cluster)

        # Record a history snapshot for the Overview charts before telling clients the scan is done.
        overall = "completed" if results and all(str(getattr(r["status"], "value", r["status"])) == "completed" for r in results) else "failed"
        if scan_control.is_cancelled(scan_id):
            overall = "cancelled"
        clusters.touch(request.cluster, overall)
        if overall != "cancelled":  # a stopped scan leaves partial output: no history snapshot from it
            await record_snapshot(scan_id, request.scan_type.value, overall, cluster)

        await manager.broadcast("__EOF__", scan_id)
    finally:
        manager.end_run(scan_id)
        scan_control.clear(scan_id)

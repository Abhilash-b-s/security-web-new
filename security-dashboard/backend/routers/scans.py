from fastapi import APIRouter, WebSocket, BackgroundTasks, HTTPException, Request
from models import ScanRequest, ScanType, ScanStartResponse, ErrorResponse
from services import scanner, audit_hook, clusters, scan_guard
from auth import decode_token
import re
import uuid

router = APIRouter()

# scan_id is client-supplied and becomes the report filename reports/<scan_id>.json,
# so restrict it to a safe charset to block path traversal (e.g. ../../app/script.sh).
_SCAN_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

@router.post(
    "/start",
    response_model=ScanStartResponse,
    summary="Initiate Security Scan",
    description="""
    Start a new security scan of the specified type.

    ## Supported Scan Types

    * **trivy-image**: Scan container images for vulnerabilities (CVEs)
    * **trivy-sbom**: Generate Software Bill of Materials for the cluster
    * **trivy-cluster**: Perform cluster-wide security scanning
    * **trivy-repo**: Scan Git repositories for vulnerabilities in source code
    * **kube-bench**: Run CIS Kubernetes Benchmark security checks
    * **kyverno**: Validate Kubernetes resources against defined policies
    * **nmap**: Perform network port scanning and service detection
    * **all**: Execute all scan types sequentially

    ## Real-time Progress

    After initiating a scan, connect to the WebSocket endpoint at `/api/scans/ws/{scan_id}`
    to receive real-time output and progress updates.

    ## Registry Authentication

    For private container registries, configure credentials via the `/api/settings/registries`
    endpoint before running image scans.

    ## Returns

    A scan ID that can be used to:
    - Track progress via WebSocket
    - Retrieve results from `/api/reports/{scan_id}`
    """,
    responses={
        200: {
            "description": "Scan initiated successfully",
            "model": ScanStartResponse,
        },
        422: {
            "description": "Invalid request parameters",
            "model": ErrorResponse,
        }
    },
    tags=["scans"]
)
async def start_scan(request: ScanRequest, background_tasks: BackgroundTasks, http_request: Request):
    """
    Initiate a security scan and return a scan ID for tracking.

    The scan executes asynchronously in the background. Use the returned scan_id
    to connect via WebSocket for real-time output, or retrieve the final report
    after completion.
    """
    scan_id = request.scan_id or str(uuid.uuid4())
    if not _SCAN_ID_RE.match(scan_id):
        raise HTTPException(status_code=400, detail="Invalid scan_id")
    clusters.check_scan_target(request.cluster, request.scan_type.value)
    busy = scan_guard.conflict([r["scan_type"] for r in scanner.manager.list_runs()], request.scan_type.value)
    if busy:
        raise HTTPException(status_code=409, detail=busy)
    # Register the run now so it is listed as active before the background task starts.
    scanner.manager.start_run(scan_id, request.scan_type.value)
    audit_hook.record(http_request, "scan.start", request.scan_type.value, f"scan_id={scan_id}", cluster=request.cluster)
    background_tasks.add_task(scanner.run_scan_task, scan_id, request)
    return {"scan_id": scan_id, "status": "initiated"}

@router.get(
    "/active",
    summary="List running scans",
    description="Scans currently running on this server, with the number of output lines buffered so far. "
                "Connect to `/api/scans/ws/{scan_id}` to replay the output and follow it live.",
    tags=["scans"],
)
async def active_scans():
    return scanner.manager.list_runs()


@router.post(
    "/{scan_id}/stop",
    summary="Stop a running scan",
    description="Stops the scan's processes (and, for a full scan, the scans still waiting to run). The report is saved with status `cancelled`.",
    tags=["scans"],
)
async def stop_scan(scan_id: str, request: Request):
    if not _SCAN_ID_RE.match(scan_id) or scan_id not in scanner.manager.runs:
        raise HTTPException(status_code=404, detail="No running scan with that id")
    run = scanner.manager.runs[scan_id]
    audit_hook.record(request, "scan.stop", run["scan_type"], f"scan_id={scan_id}")
    await scanner.scan_control.stop(scan_id)
    return {"status": "stopping", "scan_id": scan_id}


@router.websocket("/ws/{scan_id}")
async def websocket_endpoint(websocket: WebSocket, scan_id: str):
    """
    WebSocket endpoint for real-time scan progress streaming.

    Connect to this endpoint after starting a scan to receive:
    - Command output in real-time
    - Progress indicators
    - Error messages
    - Completion notification (message: "__EOF__")

    Example usage:
    ```javascript
    const ws = new WebSocket('ws://localhost:8000/api/scans/ws/your-scan-id');
    ws.onmessage = (event) => {
        if (event.data === '__EOF__') {
            console.log('Scan completed');
        } else {
            console.log('Output:', event.data);
        }
    };
    ```
    """
    claims = decode_token(websocket.query_params.get("token"))
    if not claims or claims.get("role") != "superuser":
        await websocket.close(code=1008)
        return
    await scanner.handle_websocket(websocket, scan_id)

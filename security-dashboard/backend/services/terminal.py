import asyncio
import logging
from fastapi import WebSocket, APIRouter
import shlex

from auth import decode_token

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("terminal")

router = APIRouter()

COMMAND_TIMEOUT = 60  # seconds; kills commands that hang

# `kubectl get` options that read local files, never finish, or send the pod's credentials elsewhere.
BLOCKED_FLAGS = (
    "-f", "--filename", "-k", "--kustomize", "--kubeconfig", "-w", "--watch", "--watch-only",
    "-s", "--server", "--token", "--client-key", "--client-certificate", "--certificate-authority",
)
BLOCKED_SHORT = set("fkws")    # short forms of the above
VALUE_SHORT = set("olLncs")    # short flags that take a value: the rest of a cluster like "-owide" is that value


def _blocked_short_cluster(arg: str) -> bool:
    """True if a short-flag cluster such as "-Aw" contains a blocked flag before any value-taking flag."""
    for ch in arg[1:].split("=", 1)[0]:
        if ch in BLOCKED_SHORT:
            return True
        if ch in VALUE_SHORT:
            return False
    return False


def parse_command(command_line: str):
    """Return the argv to run, or (None, reason) if the command is not an allowed `kubectl get`.

    The line is split with shlex and run without a shell, so ; | && $( ) and redirects are
    passed to kubectl as plain text instead of being executed.
    """
    try:
        argv = shlex.split(command_line)
    except ValueError as e:
        return None, f"Could not parse the command: {e}"
    if len(argv) < 2 or argv[0] != "kubectl" or argv[1] != "get":
        return None, "Only 'kubectl get' commands are allowed"
    for arg in argv[2:]:
        name = arg.split("=", 1)[0]
        if name in BLOCKED_FLAGS or (arg.startswith("-") and not arg.startswith("--") and len(arg) > 2 and _blocked_short_cluster(arg)):
            return None, f"The option '{name}' is not allowed in this terminal"
    return argv, None


@router.websocket("/ws")
async def terminal_websocket(websocket: WebSocket):
    claims = decode_token(websocket.query_params.get("token"))
    if not claims or claims.get("role") != "superuser":
        await websocket.close(code=1008)
        return
    await websocket.accept()
    logger.info("Terminal WS Connected")

    try:
        while True:
            # Receive command from client
            command_line = await websocket.receive_text()

            if not command_line.strip():
                continue

            argv, reason = parse_command(command_line.strip())
            if argv is None:
                logger.info(f"Rejected: {command_line}")
                await websocket.send_text(f"Error: {reason}\n")
                continue
            logger.info(f"Executing: {shlex.join(argv)}")

            try:
                process = await asyncio.create_subprocess_exec(
                    *argv,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT
                )

                async def stream():
                    while True:
                        data = await process.stdout.read(4096)
                        if not data:
                            break
                        await websocket.send_text(data.decode('utf-8', errors='replace'))
                    await process.wait()

                try:
                    await asyncio.wait_for(stream(), timeout=COMMAND_TIMEOUT)
                except asyncio.TimeoutError:
                    process.kill()
                    await websocket.send_text(f"\nError: command stopped after {COMMAND_TIMEOUT}s\n")

            except Exception as e:
                await websocket.send_text(f"Error executing command: {str(e)}\n")

    except Exception as e:
        logger.error(f"Terminal WS Error: {e}")
    finally:
        logger.info("Terminal WS Disconnected")

from fastapi import APIRouter, WebSocket, BackgroundTasks
from models import ScanRequest, ScanType, ScanStartResponse, ErrorResponse
from services import scanner
import uuid

router = APIRouter()

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
async def start_scan(request: ScanRequest, background_tasks: BackgroundTasks):
    """
    Initiate a security scan and return a scan ID for tracking.

    The scan executes asynchronously in the background. Use the returned scan_id
    to connect via WebSocket for real-time output, or retrieve the final report
    after completion.
    """
    scan_id = request.scan_id or str(uuid.uuid4())
    # Register the run now so it is listed as active before the background task starts.
    scanner.manager.start_run(scan_id, request.scan_type.value)
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
    await scanner.handle_websocket(websocket, scan_id)

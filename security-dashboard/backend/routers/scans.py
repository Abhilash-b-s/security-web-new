from fastapi import APIRouter, WebSocket, BackgroundTasks
from models import ScanRequest, ScanType
from services import scanner
import uuid

router = APIRouter()

@router.post("/start")
async def start_scan(request: ScanRequest, background_tasks: BackgroundTasks):
    scan_id = request.scan_id or str(uuid.uuid4())
    # In a real app, you'd save initial state to DB here
    background_tasks.add_task(scanner.run_scan_task, scan_id, request)
    return {"scan_id": scan_id, "status": "initiated"}

@router.websocket("/ws/{scan_id}")
async def websocket_endpoint(websocket: WebSocket, scan_id: str):
    await scanner.handle_websocket(websocket, scan_id)

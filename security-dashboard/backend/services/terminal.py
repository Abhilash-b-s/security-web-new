import asyncio
import logging
from fastapi import WebSocket, APIRouter
import shlex

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("terminal")

router = APIRouter()

@router.websocket("/ws")
async def terminal_websocket(websocket: WebSocket):
    await websocket.accept()
    logger.info("Terminal WS Connected")
    
    try:
        while True:
            # Receive command from client
            command_line = await websocket.receive_text()
            logger.info(f"Executing: {command_line}")
            
            if not command_line.strip():
                continue

            # Security: Only allow kubectl commands
            if not command_line.strip().startswith("kubectl"):
                await websocket.send_text("Error: Only kubectl commands are allowed\n")
                continue

            try:
                # Execute command
                process = await asyncio.create_subprocess_shell(
                    command_line,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT
                )

                # Stream output
                while True:
                    data = await process.stdout.read(4096)
                    if not data:
                        break
                    await websocket.send_text(data.decode('utf-8', errors='replace'))
                
                await process.wait()
                # Optional: Send a prompt or completion signal if needed, 
                # but for a simple terminal, just output is enough.
                
            except Exception as e:
                error_msg = f"Error executing command: {str(e)}\n"
                await websocket.send_text(error_msg)

    except Exception as e:
        logger.error(f"Terminal WS Error: {e}")
    finally:
        logger.info("Terminal WS Disconnected")

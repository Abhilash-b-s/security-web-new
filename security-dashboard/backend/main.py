from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import scans, reports, files, settings
from services import terminal

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import os

app = FastAPI(title="Security Scanning Dashboard")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scans.router, prefix="/api/scans", tags=["scans"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(terminal.router, prefix="/api/terminal", tags=["terminal"])

# Mount static files (React build)
# Check if static directory exists (it will in Docker, might not locally)
STATIC_DIR = os.getenv("STATIC_DIR", "/app/static")
if os.path.exists(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=f"{STATIC_DIR}/assets"), name="assets")

# Mount new reports directory
NEW_DIR = os.getenv("NEW_DIR", "/app/new")
if os.path.exists(NEW_DIR):
    app.mount("/new", StaticFiles(directory=NEW_DIR), name="new")

@app.get("/")
async def serve_index():
    # Serve index.html for root
    if os.path.exists(f"{STATIC_DIR}/index.html"):
        return FileResponse(f"{STATIC_DIR}/index.html")
    return {"message": "Security Dashboard API is running (Frontend not found)"}

# Catch-all for SPA routing (excluding API)
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    # If path starts with api/, return 404 naturally
    if full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"error": "Not Found"})
    
    # Check if a static file exists at this path
    static_file_path = os.path.join(STATIC_DIR, full_path)
    if os.path.exists(static_file_path) and os.path.isfile(static_file_path):
        return FileResponse(static_file_path)
    
    # Serve index.html for any other route (client-side routing)
    if os.path.exists(f"{STATIC_DIR}/index.html"):
        return FileResponse(f"{STATIC_DIR}/index.html")
    return {"error": "Frontend not found"}

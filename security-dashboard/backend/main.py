from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from routers import scans, reports, files, settings, dashboard, suppressions
from services import terminal

from fastapi.staticfiles import StaticFiles
import os

app = FastAPI(
    title="Security Scanning Dashboard API",
    description="""
    Comprehensive security scanning platform for Kubernetes clusters, container images, and code repositories.

    ## Features

    * **Multiple Security Scanners**: Trivy, Kube-bench, Kyverno, Nmap
    * **Real-time Progress**: WebSocket-based live scan output
    * **Report Management**: Store and retrieve scan results
    * **Registry Configuration**: Manage multiple container registry credentials
    * **Git Repository Scanning**: Scan source code for vulnerabilities
    * **Interactive Terminal**: Execute kubectl commands via WebSocket

    ## Scan Types

    * `trivy-image`: Container image vulnerability scanning
    * `trivy-sbom`: Generate Software Bill of Materials
    * `trivy-cluster`: Kubernetes cluster-wide security scanning
    * `trivy-repo`: Git repository vulnerability scanning
    * `kube-bench`: CIS Kubernetes Benchmark checks
    * `kyverno`: Kubernetes policy validation
    * `nmap`: Network port scanning and service detection
    * `all`: Execute all scans sequentially

    ## Authentication

    Currently the API does not require authentication. It is intended for internal use within a secured network.

    ## WebSocket Endpoints

    * `/api/scans/ws/{scan_id}`: Real-time scan progress streaming
    * `/api/terminal/ws`: Interactive kubectl terminal
    """,
    version="1.0.0",
    contact={
        "name": "Security Dashboard Team",
    },
    license_info={
        "name": "Apache 2.0",
        "url": "https://www.apache.org/licenses/LICENSE-2.0.html",
    },
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add GZip compression middleware for faster asset delivery
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(scans.router, prefix="/api/scans", tags=["scans"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(terminal.router, prefix="/api/terminal", tags=["terminal"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(suppressions.router, prefix="/api/suppressions", tags=["suppressions"])

# Mount static files (React build)
# Check if static directory exists (it will in Docker, might not locally)
STATIC_DIR = os.getenv("STATIC_DIR", "/app/static")

# Mount new reports directory
NEW_DIR = os.getenv("NEW_DIR", "/app/new")
if os.path.exists(NEW_DIR):
    app.mount("/new", StaticFiles(directory=NEW_DIR), name="new")

@app.get(
    "/health",
    tags=["health"],
    summary="Health Check",
    description="Check if the API is running and healthy. Use this endpoint for monitoring and load balancer health checks.",
    responses={
        200: {
            "description": "Service is healthy",
            "content": {
                "application/json": {
                    "example": {
                        "status": "healthy",
                        "service": "Security Dashboard API",
                        "version": "1.0.0"
                    }
                }
            }
        }
    }
)
async def health_check():
    """Health check endpoint for monitoring and load balancers."""
    return {
        "status": "healthy",
        "service": "Security Dashboard API",
        "version": "1.0.0"
    }

# Built UI last, so API routes and /new match first. StaticFiles rejects paths outside STATIC_DIR.
if os.path.exists(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="ui")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pathlib import Path
from routers import clusters, scans, reports, files, settings, dashboard, suppressions, features, compliance, auth as auth_router_mod
from routers import audit as audit_router, findings as findings_router
from services import migrate
from services import terminal
import auth
import ratelimit

from fastapi.staticfiles import StaticFiles
import os

# Swagger/ReDoc/OpenAPI leak the full API surface to anonymous users; off by default,
# enable in dev with ENABLE_DOCS=true.
_docs_enabled = os.getenv("ENABLE_DOCS", "false").lower() in ("1", "true", "yes")

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
    * `trivy-compliance`: Trivy NSA / Pod Security compliance specs
    * `trivy-repo`: Git repository vulnerability scanning
    * `kube-bench`: CIS Kubernetes Benchmark checks
    * `kyverno`: Kubernetes policy validation
    * `nmap`: Network port scanning and service detection
    * `all`: Execute all scans sequentially

    ## Authentication

    All `/api/*` and `/new/*` routes require a Bearer JWT obtained from `POST /api/login`.
    Scan, settings, and terminal routes additionally require the `superuser` role.

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
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

# The SPA is served same-origin (StaticFiles in prod, vite proxy in dev), so CORS is only
# needed for direct cross-origin dev. Reflecting arbitrary origins with credentials was the
# bug; the JWT rides the Authorization header (no cookies), so credentials are not needed.
_allowed_origins = [o.strip() for o in os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:8000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add GZip compression middleware for faster asset delivery
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Paths requiring the superuser role; everything else under /api or /new needs any valid token.
SUPERUSER_PREFIXES = ("/api/scans", "/api/settings", "/api/terminal", "/api/audit")

# Swagger UI / ReDoc need inline + CDN assets a strict CSP would block; gate these in prod instead.
_CSP_SKIP = ("/docs", "/redoc", "/openapi.json")
_CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws: wss:; "
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
)


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    return xff.split(",")[0].strip() if xff else (request.client.host if request.client else "?")


# NOTE: auth_middleware is defined before security_headers so that security_headers is added
# last and therefore wraps it (outermost) — headers land on every response, 401/403/429 included.
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS":  # CORS preflight
        return await call_next(request)
    if path == "/api/login" or path == "/health":
        if path == "/api/login" and request.method == "POST" and ratelimit.limited(_client_ip(request)):
            return JSONResponse(status_code=429, content={"detail": "Too many login attempts, slow down"})
        return await call_next(request)
    if not (path.startswith("/api/") or path.startswith("/new/")):
        return await call_next(request)  # static UI
    header = request.headers.get("authorization", "")
    token = header[7:] if header.lower().startswith("bearer ") else None
    claims = auth.decode_token(token)
    if not claims:
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
    if path.startswith(SUPERUSER_PREFIXES) and claims.get("role") != "superuser":
        return JSONResponse(status_code=403, content={"detail": "Forbidden"})
    return await call_next(request)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
    if not request.url.path.startswith(_CSP_SKIP):
        resp.headers.setdefault("Content-Security-Policy", _CSP)
    return resp


app.include_router(auth_router_mod.router, prefix="/api", tags=["auth"])
app.include_router(scans.router, prefix="/api/scans", tags=["scans"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(terminal.router, prefix="/api/terminal", tags=["terminal"])
app.include_router(features.router, prefix="/api/features", tags=["features"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(clusters.router, prefix="/api/clusters", tags=["clusters"])
app.include_router(suppressions.router, prefix="/api/suppressions", tags=["suppressions"])
app.include_router(findings_router.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(audit_router.router, prefix="/api/audit", tags=["audit"])
app.include_router(compliance.router, prefix="/api/compliance", tags=["compliance"])

migrate.run()  # one-time import of the old JSON state files into the database

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

# Serve the built SPA (registered last, so /api/* and /new/* match first).
# A real asset file is returned directly (path-traversal guarded via the parents check);
# any other non-API path returns index.html so client-side routes like /policy/image and
# /events resolve on refresh or direct load. Never opens a user-controlled path outside STATIC_DIR.
if os.path.exists(STATIC_DIR):
    _STATIC_ROOT = Path(STATIC_DIR).resolve()

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith(("api/", "new/")):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        if full_path:
            target = (_STATIC_ROOT / full_path).resolve()
            if _STATIC_ROOT in target.parents and target.is_file():
                return FileResponse(target)
        return FileResponse(_STATIC_ROOT / "index.html")

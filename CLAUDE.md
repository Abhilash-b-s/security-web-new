# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A DevSecOps security dashboard — a containerized full-stack web application for running security scans (Trivy, Kube-bench, Kyverno, Nmap) against Kubernetes clusters, container images, and Git repositories, with a React frontend and FastAPI backend.

## Build & Run Commands

### Local Development (backend + frontend)
```bash
./start-app.sh
# Frontend: http://localhost:5173
# Backend API + Swagger: http://localhost:8000/docs
```

### Frontend only
```bash
cd security-dashboard/frontend
npm install
npm run dev       # Dev server on :5173
npm run build     # Production build → dist/
```

### Backend only
```bash
cd security-dashboard/backend
python3 -m venv ../venv && source ../venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Docker
```bash
docker build -t security-dashboard:latest .
docker run -d -p 8000:8000 \
  -v ~/.kube:/root/.kube:ro \
  -v /var/run/docker.sock:/var/run/docker.sock \
  security-dashboard:latest
```

### Kubernetes
```bash
./build_and_deploy.sh          # Build, push, and deploy
kubectl apply -f security-dashboard/k8s/dashboard.yaml   # then dashboard-rbac.yaml, dashboard-admission-policy.yaml
# Auth Secret is NOT in dashboard.yaml (see dashboard-secret.example.yaml); build_and_deploy.sh [-y] creates it only if missing
# Access via NodePort 30095, namespace: security-ops
```

No test suite exists. No linter is configured.

## Architecture

### Data Flow

```
Browser (React SPA)
  ├─ REST POST /api/scans/start   →  FastAPI (main.py)
  │                                    └─ BackgroundTask → scanner.py
  ├─ WebSocket /api/scans/ws/{id} ←  Real-time stdout stream ("__EOF__" signals completion)
  ├─ REST GET  /api/reports/       →  JSON files in security-dashboard/backend/reports/
  └─ WebSocket /api/terminal/ws   ←→  Interactive kubectl shell
```

The vite dev server proxies `/api` and `/ws` to `http://localhost:8000`. In production (Docker), FastAPI serves the React build as static files from `$STATIC_DIR` (env default `/app/static`).

### Key Entry Points

| Component | Entry point |
|-----------|-------------|
| React SPA | `security-dashboard/frontend/src/main.jsx` → `App.jsx` |
| FastAPI app | `security-dashboard/backend/main.py` |
| Scan execution engine | `security-dashboard/backend/services/scanner.py` |
| WebSocket terminal | `security-dashboard/backend/services/terminal.py` |
| Kubernetes manifests | `security-dashboard/k8s/dashboard.yaml` |

### Backend Structure

- **`main.py`** — FastAPI setup, CORS, GZip, router registration, static file + SPA serving
- **`models.py`** — All Pydantic models (`ScanRequest`, `ScanResult`, `RegistryCredential`, `GitConfig`, etc.)
- **`routers/scans.py`** — `POST /api/scans/start` (returns `scan_id`), `WS /api/scans/ws/{scan_id}`
- **`routers/reports.py`** — Lists and retrieves JSON reports from `reports/` directory
- **`routers/settings.py`** — Registry credentials (`registries.json`) and Git config (in-memory)
- **`routers/dashboard.py`** — Aggregates statistics from stored reports
- **`services/scanner.py`** — `ConnectionManager` (WebSocket broadcast per `scan_id`), `_run_command` (subprocess + async streaming), per-scan-type command builders
- **`services/terminal.py`** — PTY-based WebSocket terminal

Reports are stored as JSON files in `security-dashboard/backend/reports/` keyed by `scan_id`. No database.

### Frontend Structure

- **`App.jsx`** — Main component: tab routing (Dashboard, Event Logs, Scan Reports, Settings, Terminal, Policy Reports), auth guard (`localStorage`), role-based tab visibility
- **`components/ScanControl.jsx`** — Sidebar with scan type selector and trigger button
- **`components/DashboardCharts.jsx`** — Recharts visualizations of scan statistics
- **`components/LogViewer.jsx`** — Real-time WebSocket output display
- **`components/ReportViewer.jsx`** — Report browsing, filtering, download
- **`components/Settings.jsx`** — Registry and Git config forms
- **`components/WebTerminal.jsx`** — Interactive kubectl terminal via WebSocket
- **`components/PolicyReports.jsx`** — Kyverno policy compliance view

Auth is localStorage-based with two roles: `superuser` (all tabs) and `user` (reports/policy tabs only). No backend auth enforcement — the API is unauthenticated.

### Scan Types (`models.py` `ScanType` enum)

`trivy-image`, `trivy-sbom`, `trivy-cluster`, `trivy-repo`, `kube-bench`, `kyverno`, `nmap`, `all`

### Environment Variables (runtime)

| Variable | Default | Purpose |
|----------|---------|---------|
| `STATIC_DIR` | `/app/static` | React build output served by FastAPI |
| `NEW_DIR` | `/app/new` | Reports mounted at `/new` |
| `APP_HOME` | `/app` | App working directory |

### Kubernetes Deployment Notes

- Namespace: `security-ops`; NodePort service on 30095
- RBAC (`dashboard-rbac.yaml`): read-only ClusterRole, no Secrets; namespaced Role for Jobs/pods/pods-log in `security-ops` only
- Pod runs non-root (uid 10001), caps dropped, seccomp RuntimeDefault, read-only root fs; no `hostPID`, no hostPath mounts, no containerd socket
- kube-bench runs as a short-lived Job (`services/kubebench_job.py`, hostPID + read-only host paths); `dashboard-admission-policy.yaml` restricts the dashboard SA to creating only that fixed Job
- Trivy image scans pull from registries (`--image-src remote`); the scan log ends with `scanned=N skipped=M`
- Web terminal is off unless `ENABLE_TERMINAL=true`; `GET /api/features` tells the UI; commands are audit-logged
- Image: `quay.io/abhilash_bs1/security-dashboard:latest`

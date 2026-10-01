# DevSecOps Security Dashboard

## Overview
The Security Dashboard is a comprehensive, containerized security management platform designed for Kubernetes environments. It unifies multiple industry-standard security tools into a single, intuitive interface, providing real-time visibility into the security posture of your infrastructure, applications, and source code.

This platform enables security teams, DevOps engineers, and developers to perform continuous security assessments, track compliance, and remediate vulnerabilities efficiently.

<img width="2752" height="1536" alt="image" src="https://github.com/user-attachments/assets/3be9a86a-8e65-4ec4-9006-3af96ad865a5" />

## Key Features

### 🛡️ Unified Security Operations
- **Centralized Dashboard**: Monitor system status and latest security events at a glance
- **Integrated Scanning**: Trigger and manage scans from multiple tools directly via the UI
- **Web Terminal**: Built-in web-based terminal for direct command-line access with kubectl integration
- **Theme Support**: Persistent Light/Dark mode toggle with high-contrast optimization
- **Real-time Updates**: WebSocket-based live scan progress and event streaming
- **Authentication**: Login system for secure access to the dashboard

### 🔍 Comprehensive Scanning Capabilities
The dashboard integrates the following security tools:

#### Source Code Security
- **Trivy Repo Scan**: Scans remote Git repositories for vulnerabilities, misconfigurations, and secrets
- **SBOM Inventory**: Generates Software Bill of Materials (SBOM) for your artifacts

#### Container & Cluster Security
- **Image Vulnerabilities**: Scans container images for CVEs using Trivy
- **Cluster Risks**: Identifies misconfigurations and security risks in the Kubernetes cluster
- **Policy Compliance**: Visualizes Kyverno policy reports and violations with status tracking
- **CIS Benchmarks**: Runs Kube-Bench to check compliance with CIS Kubernetes Benchmarks

#### Network Security
- **Nmap Scan**: Performs network discovery, port scanning, and service detection

### 📊 Detailed Reporting
- **Interactive Reports**: Filterable and searchable HTML reports for all scan types
- **Visual Analytics**: Charts and graphs to visualize vulnerability distributions and severity levels
- **Export Capabilities**: Download reports in multiple formats (JSON, HTML, ZIP archives)
- **Git Integration**: Securely configure and manage Git credentials for private repository scanning
- **Registry Management**: Configure multiple container registry credentials for private image scanning
- **Report History**: Access historical scan results and track security posture over time

## Technology Stack

### Frontend
- **Framework**: React 18.2
- **Build Tool**: Vite 5.1
- **Styling**: Tailwind CSS 3.4, PostCSS, Autoprefixer
- **Icons**: Lucide React 0.344
- **Utilities**: clsx, tailwind-merge for dynamic styling
- **Archive Support**: JSZip 3.10 for report compression

### Backend
- **Framework**: FastAPI (Python 3.12)
- **Server**: Uvicorn with WebSocket support
- **API Documentation**: OpenAPI (Swagger UI), ReDoc
- **Architecture**: RESTful API with real-time WebSocket endpoints

### Security Tools (Integrated)
- **Trivy** v0.74.0 - Vulnerability scanner for containers, code, and IaC
- **Kube-Bench** v0.16.0 - CIS Kubernetes Benchmark checker
- **Kyverno CLI** v1.19.1 - Kubernetes policy validation
- **Nmap** - Network scanning and security auditing
- **Kubectl** - Kubernetes command-line tool (latest stable)

### Infrastructure
- **Containerization**: Multi-stage Docker build (Node 24 + Python 3.12)
- **Orchestration**: Kubernetes (tested with Minikube, Kind, managed clusters)
- **Registry**: Supports any OCI-compliant registry (Docker Hub, Quay.io, etc.)

## Architecture

### Directory Structure

```
security-web/
├── security-dashboard/
│   ├── frontend/           # React application
│   │   ├── src/
│   │   │   ├── components/ # UI components
│   │   │   ├── App.jsx     # Main app component
│   │   │   └── main.jsx    # Entry point
│   │   ├── package.json
│   │   └── vite.config.js
│   └── backend/            # FastAPI application
│       ├── routers/        # API route handlers
│       │   ├── scans.py    # Scan endpoints
│       │   ├── reports.py  # Report endpoints
│       │   ├── files.py    # File serving
│       │   └── settings.py # Configuration
│       ├── services/       # Business logic
│       │   ├── scanner.py  # Scan orchestration
│       │   └── terminal.py # WebSocket terminal
│       ├── models.py       # Data models
│       ├── main.py         # FastAPI app entry
│       └── requirements.txt
├── scripts/                # Utility scripts
│   ├── kyvernopolicy/      # Kyverno policy files
│   └── *.py                # Report processing scripts
├── new/                    # Generated reports directory
├── Dockerfile              # Multi-stage build definition
├── build_and_deploy.sh     # Automated deployment script
├── start-app.sh            # Local development startup
└── *_run_*.sh              # Individual scan scripts
```

## Getting Started

### Prerequisites

#### For Kubernetes Deployment:
- Docker Engine (20.10+)
- Kubernetes Cluster (Minikube, Kind, K3s, or managed cloud provider)
- `kubectl` configured to communicate with your cluster
- Container registry access (Docker Hub, Quay.io, etc.)

#### For Local Development:
- Docker Engine OR:
  - Node.js 18+ and npm
  - Python 3.12+
  - Security tools (Trivy, Nmap, Kubectl)

### Installation & Deployment

#### Option 1: Automated Kubernetes Deployment (Recommended)

The project provides an automated script to build, push, and deploy to Kubernetes.

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd security-web
   ```

2. **Configure the deployment script**:
   Edit `build_and_deploy.sh` to set your registry and deployment details:
   ```bash
   IMAGE="your-registry/security-dashboard:latest"
   DEPLOYMENT="security-dashboard"
   NAMESPACE="security-ops"
   ```

3. **Build and Deploy**:
   ```bash
   chmod +x build_and_deploy.sh
   ./build_and_deploy.sh
   ```

   This script will:
   - Build the Docker image using multi-stage build
   - Push to your configured container registry
   - Prompt for confirmation
   - Restart the Kubernetes deployment
   - Wait for rollout completion

#### Option 2: Manual Kubernetes Deployment

1. **Build the Docker Image**:
   ```bash
   docker build -t your-registry/security-dashboard:latest .
   ```

2. **Push to Registry**:
   ```bash
   docker push your-registry/security-dashboard:latest
   ```

3. **Create Kubernetes resources**:
   ```bash
   kubectl create namespace security-ops
   kubectl apply -f k8s/dashboard.yaml
   ```

4. **Access the dashboard**:
   ```bash
   # Get the NodePort assigned to the service
   kubectl get svc -n security-ops

   # Access the dashboard at:
   # http://<node-ip>:<node-port>
   # For Minikube: minikube service security-dashboard -n security-ops --url
   ```

5. **Verify deployment**:
   ```bash
   kubectl get pods -n security-ops
   kubectl logs -f deployment/security-dashboard -n security-ops
   ```

#### Option 3: Docker Deployment

Run as a standalone container:

```bash
docker build -t security-dashboard:latest .
docker run -d \
  --name security-dashboard \
  -p 8000:8000 \
  -v ~/.kube:/root/.kube:ro \
  -v /var/run/docker.sock:/var/run/docker.sock \
  security-dashboard:latest
```

Access the dashboard at `http://localhost:8000`

## API Documentation

### API Endpoints

The backend exposes a comprehensive REST API with OpenAPI documentation.

#### Base URL
- Production: `http://<dashboard-url>:8000`
- Local Development: `http://localhost:8000`

#### Interactive Documentation
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`
- **OpenAPI Spec**: `http://localhost:8000/openapi.json`

### Scan Types

| Scan Type | Description | Target |
|-----------|-------------|--------|
| `trivy-image` | Container image vulnerability scanning | Image name/tag |
| `trivy-sbom` | Generate Software Bill of Materials | Image/Repository |
| `trivy-cluster` | Kubernetes cluster-wide security scan | Current cluster |
| `trivy-repo` | Git repository vulnerability scanning | Git repository URL |
| `kube-bench` | CIS Kubernetes Benchmark compliance | Current cluster |
| `kyverno` | Kubernetes policy validation | Current cluster |
| `nmap` | Network port scanning | Target IP/hostname |
| `all` | Execute all scans sequentially | All targets |

### WebSocket Communication

The dashboard uses WebSockets for real-time updates:

**Scan Progress** (`/api/scans/ws/{scan_id}`)
- Streams live scan output
- Progress updates
- Error messages
- Completion notifications

**Interactive Terminal** (`/api/terminal/ws`)
- Execute kubectl commands
- Real-time command output
- Persistent shell session

## Dashboard User Guide

### 1. 🔐 Login
- Access the dashboard and enter credentials
- Theme preference persists across sessions

### 2. ⚙️ Settings (CRITICAL Setup)
**Most Important Step:** Before running any **Source Code** or **Image** scans, you must configure your environment here.

#### Git Configuration
- **Username**: Your Git username
- **Personal Access Token (PAT)**: Token with repo access permissions
- Required for private repository scanning
- Used by Trivy Repo Scan

#### Registry Credentials
- Configure multiple container registries
- Format: Registry URL, Username, Password/Token
- Required for scanning private container images
- Supports Docker Hub, Quay.io, GCR, ECR, etc.

**Security Note**: Credentials are stored in the container and not persisted beyond the pod lifecycle.

### 3. 🚀 Scan Control
Start security scans from the dashboard:

#### Scan Options:
- **SBOM (Software Bill of Materials)**: Generate inventory of dependencies
- **Image Scan**: Scan container images for vulnerabilities
- **Repository Scan**: Scan Git repositories for vulnerabilities and secrets
- **Network Scan**: Perform Nmap port and service discovery
- **CIS Benchmark**: Run Kube-Bench compliance checks
- **Kyverno Policies**: Validate Kubernetes resources against policies
- **Cluster Risks**: Trivy cluster-wide security assessment
- **Run All Scans**: Execute all scans sequentially

#### Usage:
1. Select scan type
2. Enter required parameters (image name, repo URL, etc.)
3. Click "Start Scan"
4. Monitor progress in Event Logs
5. View results in Scan Reports

### 4. 📋 Scan Reports
The central hub for analyzing security data. Navigate through tabs to view specific reports:

#### Report Types:
- **Policy Compliance**: Kyverno policy validation results with PASS/FAIL/ERROR/SKIP statuses
- **SBOM Inventory**: Software Bill of Materials with dependency tree
- **Source Code**: Vulnerability and secret findings from Git repositories
- **Image Vulnerabilities**: CVE details with severity ratings and fix recommendations
- **Network Security**: Nmap scan results showing open ports and services
- **CIS Benchmarks**: Detailed compliance checks with remediation guidance
- **Cluster Risks**: Kubernetes misconfigurations and security risks

#### Features:
- **Filters**: Filter by severity, status, category
- **Search**: Full-text search across findings
- **Export**: Download reports as JSON, HTML, or ZIP archives
- **Visual Analytics**: Charts showing vulnerability distribution by severity
- **Remediation Guidance**: Actionable recommendations for fixing issues

### 5. 📜 Event Logs
Monitor real-time feedback from the scanning engine:
- **Live Progress**: Watch scans execute in real-time
- **Debug Information**: Detailed logs for troubleshooting
- **Error Messages**: Clear error reporting with context
- **Completion Status**: Success/failure notifications
- **Performance Metrics**: Scan duration and resource usage

### 6. 💻 Terminal
Direct shell access to the security container:
- **Kubectl Integration**: Run kubectl commands directly
- **Cluster Inspection**: View pods, deployments, services
- **Manual Verification**: Execute custom security commands
- **Tool Access**: Direct access to Trivy, Nmap, Kyverno CLI
- **Persistent Session**: Maintain context across commands

#### Example Commands:
```bash
kubectl get pods --all-namespaces
kubectl describe pod <pod-name>
trivy image --severity HIGH,CRITICAL nginx:latest
nmap -sV -p 80,443 target.example.com
kyverno version
```

## Configuration

### Environment Variables

The application supports the following environment variables:

```bash
# Backend Configuration
STATIC_DIR=/app/static          # Frontend static files directory
NEW_DIR=/app/new                # Reports output directory
APP_HOME=/app                   # Application home directory
PYTHONPATH=/app/security-dashboard/backend

# Scan Tool Versions (Build-time)
TRIVY_VERSION=0.74.0
KUBE_BENCH_VERSION=0.16.0
KYVERNO_VERSION=1.19.1
```

### Volume Mounts

For Kubernetes deployment, mount these volumes:

```yaml
volumes:
  - name: kubeconfig
    hostPath:
      path: /root/.kube
  - name: docker-socket
    hostPath:
      path: /var/run/docker.sock
  - name: reports
    emptyDir: {}

volumeMounts:
  - name: kubeconfig
    mountPath: /root/.kube
    readOnly: true
  - name: docker-socket
    mountPath: /var/run/docker.sock
  - name: reports
    mountPath: /app/new
```

### Ports

| Port | Service | Description |
|------|---------|-------------|
| 8000 | Backend API | FastAPI + Frontend SPA |
| 5173 | Dev Frontend | Vite dev server (local only) |

## License

Proprietary / Internal Use

## Support

For issues, questions, or feature requests, please contact the Security Dashboard Team or create an issue in the project repository.

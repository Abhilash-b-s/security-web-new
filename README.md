# Armada Security Dashboard

## Overview
The Armada Security Dashboard is a comprehensive, containerized security management platform designed for Kubernetes environments. It unifies multiple industry-standard security tools into a single, intuitive interface, providing real-time visibility into the security posture of your infrastructure, applications, and source code.

## Key Features

### 🛡️ Unified Security Operations
- **Centralized Dashboard**: Monitor system status and latest security events at a glance.
- **Integrated Scanning**: Trigger and manage scans from varied tools directly via the UI.
- **Web Terminal**: Built-in web-based terminal for direct command-line access and manual verification.

### 🔍 Comprehensive Scanning Capabilities
The dashboard integrates the following tools:

- **Source Code Security**: 
    - **Trivy Repo Scan**: Scans remote Git repositories for vulnerabilities and secrets.
    - **SBOM Inventory**: Generates Software Bill of Materials for your artifacts.
- **Container & Cluster Security**:
    - **Image Vulnerabilities**: Scans container images for CVEs using Trivy.
    - **Cluster Risks**: Identifies misconfigurations and risks in the Kubernetes cluster.
    - **Policy Compliance**: Visualizes Kyverno policy reports and violations.
    - **CIS Benchmarks**: Runs Kube-Bench to check compliance with CIS Kubernetes Benchmarks.
- **Network Security**:
    - **Nmap Scan**: Performs network discovery and security auditing.

### 📊 Detailed Reporting
- **Interactive Reports**: Filterable and searchable HTML reports for all scan types.
- **Visual Analytics**: Charts and graphs to visualize vulnerability distributions and severity levels.
- **Git Integration**: Securely configure and manage Git credentials for private repository scanning.

## Technology Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide React Icons
- **Backend**: Python (FastAPI/Uvicorn), WebSocket support
- **Infrastructure**: Docker, Kubernetes (K8s)
- **Security Tools**: Trivy, Nmap, Kube-Bench, Kyverno, Kubectl

## Getting Started

### Prerequisites
- Docker Engine
- Kubernetes Cluster (Minikube, Kind, or a managed cloud provider)
- `kubectl` configured to communicate with your cluster

### Installation & Deployment

The project provides an automated script to build the Docker image, push it to a registry, and update the Kubernetes deployment.

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd security-web
   ```

2. **Configure Deployment**:
   Ensure your `k8s/dashboard.yaml` and `build_and_deploy.sh` (specifically the image tag) are configured for your container registry.

3. **Build and Deploy**:
   Run the deployment script:
   ```bash
   ./build_and_deploy.sh
   ```

   *Note: This script builds the image, pushes it to `quay.io/abhilash_bs1/security-dashboard` (default), and restarts the K8s deployment.*

### Manual Deployment

If you prefer manual steps:

1. **Build the Docker Image**:
   ```bash
   docker build -t your-registry/security-dashboard:latest .
   ```

2. **Push to Registry**:
   ```bash
   docker push your-registry/security-dashboard:latest
   ```

3. **Apply Kubernetes Manifests**:
   ```bash
   kubectl apply -f k8s/dashboard.yaml
   ```

## Usage

1. **Access the Dashboard**: 
   Open your browser and navigate to the service URL (e.g., `http://localhost:30007` or your cluster's node IP).
   
2. **Configure Settings**:
   Go to the **Settings** tab to configure Git credentials if you plan to scan private repositories.

3. **Run Scans**:
   Navigate to the **Dashboard** or **Security Operations** section to trigger specific scans (e.g., Source Code, Network, Image).

4. **View Reports**:
   Check the **Scan Reports** tab to analyze the results of completed scans.

## License
Proprietary / Internal Use.

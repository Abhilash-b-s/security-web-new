# Unified Dockerfile
# Build context: Project Root (/home/abhilash/abhi/security)

# --- Stage 1: Build Frontend ---
FROM node:24-alpine as frontend-build
WORKDIR /app/frontend

# Copy frontend dependency definitions
COPY security-dashboard/frontend/package*.json ./
RUN npm install
# Copy frontend source code
COPY security-dashboard/frontend/ .
RUN npm run build

# --- Stage 2: Backend & Runtime ---
FROM python:3.9-slim

# Install system dependencies and security tools
# - nmap: Network scanning
# - curl/wget: downloading tools
# - docker/containerd client: for socket interaction
# - procps: ps command
# - vim: Editor (requested)
ENV TRIVY_VERSION=0.68.1
ENV KUBE_BENCH_VERSION=0.14.0
ENV KYVERNO_VERSION=1.16.1

RUN apt-get update && apt-get install -y \
    nmap \
    curl \
    wget \
    gnupg \
    lsb-release \
    procps \
    jq \
    zip \
    vim \
    && rm -rf /var/lib/apt/lists/*

# Install Trivy
RUN curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin v${TRIVY_VERSION}

# Install Kube-bench
RUN wget -q https://github.com/aquasecurity/kube-bench/releases/download/v${KUBE_BENCH_VERSION}/kube-bench_${KUBE_BENCH_VERSION}_linux_amd64.tar.gz -O /tmp/kube-bench.tar.gz \
    && mkdir -p /opt/kube-bench \
    && tar -xzf /tmp/kube-bench.tar.gz -C /opt/kube-bench \
    && rm /tmp/kube-bench.tar.gz

# Install Kyverno CLI
RUN wget -q https://github.com/kyverno/kyverno/releases/download/v${KYVERNO_VERSION}/kyverno-cli_v${KYVERNO_VERSION}_linux_x86_64.tar.gz -O /tmp/kyverno.tar.gz \
    && tar -xzf /tmp/kyverno.tar.gz -C /tmp/ \
    && mv /tmp/kyverno /usr/local/bin/ \
    && rm /tmp/kyverno.tar.gz

# Install Kubectl
RUN curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    && install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

WORKDIR /app

# Copy Backend Requirements
COPY security-dashboard/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Helper Scripts & Tools from Root
COPY scripts/ /app/scripts/
COPY *_run_*.sh /app/
# Explicitly copy other requested files

COPY start-app.sh /app/
COPY logo-mobile.webp /app/
COPY security-policy-report.html /app/
COPY new/ /app/new/

# Make scripts executable
RUN chmod +x /app/*_run_*.sh /app/scripts/*.sh /app/start-app.sh

# Copy Backend Code to match host structure
COPY security-dashboard/backend/ /app/security-dashboard/backend/

# Copy Frontend Source to match host structure (for reference/mounting)
COPY security-dashboard/frontend/ /app/security-dashboard/frontend/

# Copy Frontend Build from Stage 1 (for serving)
COPY --from=frontend-build /app/frontend/dist /app/static

# Set Environment Variables
ENV PYTHONPATH=/app/security-dashboard/backend
ENV APP_HOME=/app

# Expose Port
EXPOSE 8000 8081

# Run Uvicorn from the correct location
CMD ["/bin/sh", "-c", "python3 -m http.server 8081 --directory /app/new & uvicorn security-dashboard.backend.main:app --host 0.0.0.0 --port 8000"]

# Unified Dockerfile
# Build context: Project Root (/home/abhilash/abhi/security)

# --- Stage 1: Build Frontend ---
FROM node:24-alpine AS frontend-build
WORKDIR /app/frontend

# Copy frontend dependency definitions
COPY security-dashboard/frontend/package*.json ./
RUN npm install
# Copy frontend source code
COPY security-dashboard/frontend/ .
RUN npm run build

# --- Stage 2: Backend & Runtime ---
FROM python:3.12-slim

# Build arguments for version management
ARG TRIVY_VERSION=0.74.0
ARG KUBE_BENCH_VERSION=0.16.0
ARG KYVERNO_VERSION=1.19.1

# Install system dependencies and security tools in a single layer
# - nmap: Network scanning
# - curl/wget: downloading tools
# - docker/containerd client: for socket interaction
# - procps: ps command
# - vim: Editor (requested)
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
    && rm -rf /var/lib/apt/lists/* \
    # Install Trivy
    && curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin v${TRIVY_VERSION} \
    # Install Kube-bench
    && wget -q https://github.com/aquasecurity/kube-bench/releases/download/v${KUBE_BENCH_VERSION}/kube-bench_${KUBE_BENCH_VERSION}_linux_amd64.tar.gz -O /tmp/kube-bench.tar.gz \
    && mkdir -p /opt/kube-bench \
    && tar -xzf /tmp/kube-bench.tar.gz -C /opt/kube-bench \
    && rm /tmp/kube-bench.tar.gz \
    # Install Kyverno CLI
    && wget -q https://github.com/kyverno/kyverno/releases/download/v${KYVERNO_VERSION}/kyverno-cli_v${KYVERNO_VERSION}_linux_x86_64.tar.gz -O /tmp/kyverno.tar.gz \
    && tar -xzf /tmp/kyverno.tar.gz -C /tmp/ \
    && mv /tmp/kyverno /usr/local/bin/ \
    && rm /tmp/kyverno.tar.gz \
    # Install Kubectl
    && curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    && install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl \
    && rm kubectl

WORKDIR /app

# Copy and install Python dependencies first (changes less frequently)
COPY security-dashboard/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy static assets and scripts (changes less frequently)
COPY start-app.sh /app/
COPY scripts/ /app/scripts/
COPY *_run_*.sh /app/

# Make scripts executable
RUN chmod +x /app/*_run_*.sh /app/scripts/*.sh /app/start-app.sh && mkdir -p /app/new

# Copy backend code (changes more frequently)
COPY security-dashboard/backend/ /app/security-dashboard/backend/

# Copy built frontend from Stage 1 (for serving)
COPY --from=frontend-build /app/frontend/dist /app/static

# Run as a non-root user. Writable paths: /app/new, /app/state and the reports dir (a PVC in k8s,
# owned here for plain docker run), plus /tmp (HOME, trivy cache, kubectl cache).
# repos.txt is written by the source-code scan; a symlink into /tmp keeps /app itself read-only.
RUN useradd --uid 10001 --user-group --no-create-home --shell /usr/sbin/nologin dashboard \
    && mkdir -p /app/state /app/security-dashboard/backend/reports \
    && ln -s /tmp/repos.txt /app/repos.txt \
    && chown -R dashboard:dashboard /app/new /app/state /app/security-dashboard/backend/reports
ENV HOME=/tmp \
    TRIVY_CACHE_DIR=/tmp/trivy-cache \
    PYTHONDONTWRITEBYTECODE=1
USER 10001:10001

# Set Environment Variables
ENV PYTHONPATH=/app/security-dashboard/backend
ENV APP_HOME=/app

# Expose Port
EXPOSE 8000

# Run Uvicorn from the correct location
CMD ["uvicorn", "security-dashboard.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]

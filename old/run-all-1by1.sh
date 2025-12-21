#!/bin/bash

# Script to execute security scanning commands and generate reports

set -e

OUTPUT_DIR="$(pwd)/new"
PPWD=$(pwd)
KUBE_BENCH_DIR="/opt/kube-bench"

SEPARATOR="================================================================================"
SUB_SEPARATOR="--------------------------------------------------------------------------------"

echo ""
echo "$SEPARATOR"
echo "                       Running Security Scans"
echo "$SEPARATOR"
echo ""

# Create necessary directories
mkdir -p "$OUTPUT_DIR/kube-bench"
mkdir -p "$OUTPUT_DIR/trivy-reports"
mkdir -p "$OUTPUT_DIR/trivy-cluster-report"
mkdir -p "$OUTPUT_DIR/trivy-sbom"
mkdir -p "$OUTPUT_DIR/kyverno-report"
mkdir -p "$OUTPUT_DIR/nmap"

# Copy static assets
cp "$PPWD/security-policy-report.html" "$OUTPUT_DIR/"
cp "$PPWD/logo-mobile.webp" "$OUTPUT_DIR/"


# Run Trivy SBOM scan
echo "$SUB_SEPARATOR"
echo ">>> Running Trivy SBOM Scan"
echo "$SUB_SEPARATOR"
cd "$OUTPUT_DIR/trivy-sbom"
trivy k8s --format cyclonedx --output kbom.json || true
echo "Running KBOM to SBOM conversion..."
trivy sbom kbom.json --format json > sbom.json || true
echo "Trivy SBOM reports saved to: $OUTPUT_DIR/trivy-sbom/"
cd "$PPWD"
echo ""


# Run Trivy Image Scan (Namespacewise)
echo "$SUB_SEPARATOR"
echo ">>> Running Trivy Image Scan (Namespacewise)"
echo "$SUB_SEPARATOR"
OUTPUT_DIR="$OUTPUT_DIR/trivy-reports" bash "$PPWD/scripts/scan-trivy-images-namspeacewise.sh" ALL
echo "Trivy image reports saved to: $OUTPUT_DIR/trivy-reports"
cd "$PPWD"
echo ""

# Run Nmap service discovery and cipher scanning
echo "$SUB_SEPARATOR"
echo ">>> Running Nmap Service Discovery and Cipher Scanning"
echo "$SUB_SEPARATOR"

# Step 1: Pod Setup
echo "1. Setting up Scanning Environment (Kali Linux Pod)"
if ! kubectl get pod -n default kalilinux >/dev/null 2>&1; then
    echo "   - Creating kalilinux pod..."
    kubectl run kalilinux -n default --image=quay.io/abhilash_bs1/kalilinux:latest --restart=Never --command -- sleep infinity
else
    echo "   - kalilinux pod already exists."
fi
echo "   - Waiting for pod readiness..."
kubectl wait --for=condition=Ready pod/kalilinux -n default --timeout=300s >/dev/null
echo "   - Pod is ready."
echo ""

# Step 2: Service Discovery
echo "2. Discovering Cluster Services"
cd "$OUTPUT_DIR/nmap"
echo "   - Generating nmap services list..."
bash "$PPWD/scripts/nmap_services.sh" 2>&1 | sed 's/^/     /' || true
echo ""

# Step 3: Nmap Scanning
echo "3. Executing Nmap Scans"
echo "   - Running nmap scan from pod..."
cd "$OUTPUT_DIR/nmap"
bash "$PPWD/scripts/nmap_scan_from_pod.sh" | sed 's/^/     /' || true
echo ""
echo "   - Nmap reports saved to: $OUTPUT_DIR/nmap/"
cd "$PPWD"
echo ""


# Run kube-bench
echo "$SUB_SEPARATOR"
echo ">>> Running kube-bench"
echo "$SUB_SEPARATOR"
cd "$KUBE_BENCH_DIR"
sudo ./kube-bench --config-dir $(pwd)/cfg --config $(pwd)/cfg/config.yaml > "$OUTPUT_DIR/kube-bench/kubebench.txt" 2>&1 || true
echo "kube-bench report saved to: $OUTPUT_DIR/kube-bench/kubebench.txt"
cd "$PPWD"
echo ""


# Run Trivy Cluster scan
echo "$SUB_SEPARATOR"
echo ">>> Running Trivy Cluster Scan"
echo "$SUB_SEPARATOR"
trivy k8s --timeout 300m --disable-node-collector --report summary --format json > "$OUTPUT_DIR/trivy-cluster-report/cluster.json" || true
# Zip the cluster report
cd "$OUTPUT_DIR/trivy-cluster-report"
zip -q cluster.zip cluster.json
rm cluster.json
echo "Trivy cluster report saved to: $OUTPUT_DIR/trivy-cluster-report/cluster.zip"
cd "$PPWD"
echo ""


# Run Kyverno Scan
echo "$SUB_SEPARATOR"
echo ">>> Running Kyverno Scan"
echo "$SUB_SEPARATOR"
OUTPUT_DIR="$OUTPUT_DIR" bash "$PPWD/scripts/kyverno_scan.sh" || true
echo "Kyverno report saved to: $OUTPUT_DIR/kyverno-report/"
cd "$PPWD"
echo ""


echo "$SEPARATOR"
echo "                       Security Scans Complete"
echo "$SEPARATOR"
echo ""

# Start Python HTTP server
echo "Starting Python HTTP server on port 8800..."
cd "$OUTPUT_DIR"
#python3 -m http.server 8800

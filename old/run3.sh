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
echo "                       Running Security Scans - Part 3"
echo "$SEPARATOR"
echo ""

# Create necessary directories
mkdir -p "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/kube-bench"
mkdir -p "$OUTPUT_DIR/trivy-cluster-report"

# Copy static assets
cp "$PPWD/security-policy-report.html" "$OUTPUT_DIR/"
cp "$PPWD/logo-mobile.webp" "$OUTPUT_DIR/"


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

echo "$SEPARATOR"
echo "                       Part 3 Scans Complete"
echo "$SEPARATOR"
echo ""

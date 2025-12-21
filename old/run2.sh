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
echo "                       Running Security Scans - Part 2"
echo "$SEPARATOR"
echo ""

# Create necessary directories
mkdir -p "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/nmap"

# Copy static assets
cp "$PPWD/security-policy-report.html" "$OUTPUT_DIR/"
cp "$PPWD/logo-mobile.webp" "$OUTPUT_DIR/"


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

echo "$SEPARATOR"
echo "                       Part 2 Scans Complete"
echo "$SEPARATOR"
echo ""

#!/bin/bash
set -e
OUTPUT_DIR="$(pwd)/${OUTPUT_DIR:-new}"
PPWD=$(pwd)
mkdir -p "$OUTPUT_DIR"

mkdir -p "$OUTPUT_DIR/nmap"

# Serialize runs: concurrent scans (e.g. "all" + "nmap") share k8s-services.txt and nmap.json
exec 9>"$OUTPUT_DIR/nmap/.lock"
flock 9

echo "1. Setting up Scanning Environment (Local Nmap)"
echo "   - Using local nmap installation."

echo "2. Discovering Cluster Services"
cd "$OUTPUT_DIR/nmap"
bash "$PPWD/scripts/nmap_services.sh" 2>&1 || true

echo "3. Executing Nmap Scans"
bash "$PPWD/scripts/nmap_scan_from_pod.sh" || true
echo "Nmap reports saved to: $OUTPUT_DIR/nmap/"

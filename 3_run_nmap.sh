#!/bin/bash
set -e
OUTPUT_DIR="$(pwd)/${OUTPUT_DIR:-new}"
# Copy assets to output dir to ensure they exist for reports
PPWD=$(pwd)
mkdir -p "$OUTPUT_DIR"
cp "$PPWD/security-policy-report.html" "$OUTPUT_DIR/" 2>/dev/null || true
cp "$PPWD/logo-mobile.webp" "$OUTPUT_DIR/" 2>/dev/null || true

mkdir -p "$OUTPUT_DIR/nmap"

echo "1. Setting up Scanning Environment (Local Nmap)"
echo "   - Using local nmap installation."

echo "2. Discovering Cluster Services"
cd "$OUTPUT_DIR/nmap"
bash "$PPWD/scripts/nmap_services.sh" 2>&1 | sed 's/^/     /' || true

echo "3. Executing Nmap Scans"
bash "$PPWD/scripts/nmap_scan_from_pod.sh" | sed 's/^/     /' || true
echo "   - Nmap reports saved to: $OUTPUT_DIR/nmap/"

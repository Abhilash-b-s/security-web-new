#!/bin/bash
set -e
OUTPUT_DIR="$(pwd)/${OUTPUT_DIR:-new}"
# Copy assets to output dir to ensure they exist for reports
PPWD=$(pwd)
mkdir -p "$OUTPUT_DIR"
cp "$PPWD/security-policy-report.html" "$OUTPUT_DIR/" 2>/dev/null || true
cp "$PPWD/logo-mobile.webp" "$OUTPUT_DIR/" 2>/dev/null || true

mkdir -p "$OUTPUT_DIR/trivy-cluster-report"

trivy k8s --timeout 300m --disable-node-collector --report summary --format json > "$OUTPUT_DIR/trivy-cluster-report/cluster.json" || true

cd "$OUTPUT_DIR/trivy-cluster-report"
zip -q cluster.zip cluster.json
rm cluster.json
echo "Trivy cluster report saved to: $OUTPUT_DIR/trivy-cluster-report/cluster.zip"

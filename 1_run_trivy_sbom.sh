#!/bin/bash
set -e
OUTPUT_DIR="$(pwd)/${OUTPUT_DIR:-new}"

# Copy assets to output dir to ensure they exist for reports
PPWD=$(pwd)
mkdir -p "$OUTPUT_DIR"
cp "$PPWD/security-policy-report.html" "$OUTPUT_DIR/" 2>/dev/null || true
cp "$PPWD/logo-mobile.webp" "$OUTPUT_DIR/" 2>/dev/null || true

mkdir -p "$OUTPUT_DIR/trivy-sbom"

# Copy output assets if needed, or rely on them being there? 
# run1.sh copies them to OUTPUT_DIR root. I should probably do that once or in every script to be safe.
# Or just assume they are there.
# run1.sh copies security-policy-report.html and logo-mobile.webp to OUTPUT_DIR.

cd "$OUTPUT_DIR/trivy-sbom"
trivy k8s --no-progress --format cyclonedx --output kbom.json || true
trivy sbom kbom.json --format json > sbom.json || true
echo "Trivy SBOM reports saved to: $OUTPUT_DIR/trivy-sbom/"

#!/bin/bash
set -e
OUTPUT_DIR="$(pwd)/${OUTPUT_DIR:-new}"
# Copy assets to output dir to ensure they exist for reports
PPWD=$(pwd)
mkdir -p "$OUTPUT_DIR"
cp "$PPWD/security-policy-report.html" "$OUTPUT_DIR/" 2>/dev/null || true
cp "$PPWD/logo-mobile.webp" "$OUTPUT_DIR/" 2>/dev/null || true

# Call the original Kyverno scan script
# run4.sh did: OUTPUT_DIR="$OUTPUT_DIR" bash "$PPWD/scripts/kyverno_scan.sh"
# I'll do the same.
OUTPUT_DIR="$OUTPUT_DIR" bash "scripts/kyverno_scan.sh"
echo "Kyverno report saved to: $OUTPUT_DIR/kyverno-report/"

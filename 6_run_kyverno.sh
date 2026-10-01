#!/bin/bash
set -e
OUTPUT_DIR="$(pwd)/${OUTPUT_DIR:-new}"
PPWD=$(pwd)
mkdir -p "$OUTPUT_DIR"

# Call the original Kyverno scan script
# run4.sh did: OUTPUT_DIR="$OUTPUT_DIR" bash "$PPWD/scripts/kyverno_scan.sh"
# I'll do the same.
OUTPUT_DIR="$OUTPUT_DIR" bash "scripts/kyverno_scan.sh"
echo "Kyverno report saved to: $OUTPUT_DIR/kyverno-report/"

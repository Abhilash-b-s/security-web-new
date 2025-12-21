#!/bin/bash

# Script to execute security scanning commands and generate reports

set -e

OUTPUT_DIR="$(pwd)/new"
PPWD=$(pwd)

SEPARATOR="================================================================================"
SUB_SEPARATOR="--------------------------------------------------------------------------------"

echo ""
echo "$SEPARATOR"
echo "                       Running Security Scans - Part 4"
echo "$SEPARATOR"
echo ""

# Create necessary directories
mkdir -p "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/kyverno-report"

# Copy static assets
cp "$PPWD/security-policy-report.html" "$OUTPUT_DIR/"
cp "$PPWD/logo-mobile.webp" "$OUTPUT_DIR/"

# Run Kyverno Scan
echo "$SUB_SEPARATOR"
echo ">>> Running Kyverno Scan"
echo "$SUB_SEPARATOR"
OUTPUT_DIR="$OUTPUT_DIR" bash "$PPWD/scripts/kyverno_scan.sh" || true
echo "Kyverno report saved to: $OUTPUT_DIR/kyverno-report/"
cd "$PPWD"
echo ""

echo "$SEPARATOR"
echo "                       Part 4 Scans Complete"
echo "$SEPARATOR"
echo ""

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
echo "                       Running Security Scans - Part 1"
echo "$SEPARATOR"
echo ""

# Create necessary directories
mkdir -p "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/trivy-reports"
mkdir -p "$OUTPUT_DIR/trivy-sbom"

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

echo "$SEPARATOR"
echo "                       Part 1 Scans Complete"
echo "$SEPARATOR"
echo ""
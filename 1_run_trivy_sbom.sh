#!/bin/bash
set -e
OUTPUT_DIR="$(pwd)/${OUTPUT_DIR:-new}"

mkdir -p "$OUTPUT_DIR"

mkdir -p "$OUTPUT_DIR/trivy-sbom"

cd "$OUTPUT_DIR/trivy-sbom"
trivy k8s --no-progress --format cyclonedx --output kbom.json || true
trivy sbom kbom.json --format json > sbom.json || true
echo "Trivy SBOM reports saved to: $OUTPUT_DIR/trivy-sbom/"

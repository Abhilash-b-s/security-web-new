#!/bin/bash
set -e
OUTPUT_DIR="$(realpath -m "${OUTPUT_DIR:-new}")"  # relative to cwd, or absolute (per-cluster dirs)
mkdir -p "$OUTPUT_DIR"

mkdir -p "$OUTPUT_DIR/trivy-cluster-report"

trivy k8s --no-progress --timeout 300m --disable-node-collector --report summary --format json > "$OUTPUT_DIR/trivy-cluster-report/cluster.json" || true

cd "$OUTPUT_DIR/trivy-cluster-report"
zip -q cluster.zip cluster.json
rm cluster.json
echo "Trivy cluster report saved to: $OUTPUT_DIR/trivy-cluster-report/cluster.zip"

#!/bin/bash
set -e
OUTPUT_DIR="$(realpath -m "${OUTPUT_DIR:-new}")"  # relative to cwd, or absolute (per-cluster dirs)
mkdir -p "$OUTPUT_DIR"

mkdir -p "$OUTPUT_DIR/trivy-cluster-report"

# Write to a temp file and only replace cluster.json when trivy produced something: a scan that is stopped midway
# (Stop button) must not leave an empty cluster.json that hides the previous good report.
TMP="$(mktemp "$OUTPUT_DIR/trivy-cluster-report/.cluster.XXXXXX")"
trap 'rm -f "$TMP"; exit 143' TERM INT
trap 'rm -f "$TMP"' EXIT
trivy k8s --no-progress --timeout 300m --disable-node-collector --report summary --format json > "$TMP" || true
[ -s "$TMP" ] && mv "$TMP" "$OUTPUT_DIR/trivy-cluster-report/cluster.json"

cd "$OUTPUT_DIR/trivy-cluster-report"
zip -q cluster.zip cluster.json
rm cluster.json
echo "Trivy cluster report saved to: $OUTPUT_DIR/trivy-cluster-report/cluster.zip"

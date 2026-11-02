#!/bin/bash
set -e
OUTPUT_DIR="$(realpath -m "${OUTPUT_DIR:-new}")"  # relative to cwd, or absolute (per-cluster dirs)

mkdir -p "$OUTPUT_DIR"

mkdir -p "$OUTPUT_DIR/trivy-sbom"

cd "$OUTPUT_DIR/trivy-sbom"
trivy k8s --no-progress --format cyclonedx --output kbom.json || true
# Same as the cluster scan: a stopped run must not leave an empty sbom.json behind.
TMP="$(mktemp .sbom.XXXXXX)"
trap 'rm -f "$TMP"; exit 143' TERM INT
trap 'rm -f "$TMP"' EXIT
trivy sbom kbom.json --format json > "$TMP" || true
[ -s "$TMP" ] && mv "$TMP" sbom.json
echo "Trivy SBOM reports saved to: $OUTPUT_DIR/trivy-sbom/"

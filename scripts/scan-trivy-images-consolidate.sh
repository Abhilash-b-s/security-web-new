#!/usr/bin/env bash
set -euo pipefail

# Standalone script: Scans Kubernetes images per namespace with Trivy
# and writes a single consolidated JSON file. Does not invoke or depend
# on any existing scripts in this repository.
#
# Requirements: kubectl, trivy, jq
# Output: trivy-reports/consolidated-images.json
#
# Usage:
#   ./scripts/scan-trivy-images-standalone.sh
#
# Optional environment variables:
#   NAMESPACE_FILTER   If set, only namespaces matching this regex will be scanned.
#   TRIVY_EXTRA_ARGS   Extra args passed to `trivy image` (e.g., "--severity HIGH,CRITICAL").

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORTS_DIR="${SCRIPT_DIR}/trivy-reports"
OUT_FILE="${REPORTS_DIR}/consolidated-images.json"

# Ensure output directory exists
mkdir -p "$REPORTS_DIR"

# Verify dependencies
for cmd in kubectl trivy jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[ERROR] Required command not found: $cmd" >&2
    exit 1
  fi
done

# Discover namespaces
echo "[INFO] Discovering Kubernetes namespaces..."
mapfile -t namespaces < <(kubectl get ns -o json | jq -r '.items[].metadata.name')
if [[ ${#namespaces[@]} -eq 0 ]]; then
  echo "[ERROR] No namespaces found via kubectl." >&2
  exit 1
fi

# Filter namespaces if requested
filtered_namespaces=()
for ns in "${namespaces[@]}"; do
  if [[ -n "${NAMESPACE_FILTER:-}" ]]; then
    if [[ "$ns" =~ ${NAMESPACE_FILTER} ]]; then
      filtered_namespaces+=("$ns")
    fi
  else
    filtered_namespaces+=("$ns")
  fi
done

if [[ ${#filtered_namespaces[@]} -eq 0 ]]; then
  echo "[ERROR] No namespaces matched filter '${NAMESPACE_FILTER:-<none>}'" >&2
  exit 1
fi

# Collect images per namespace and scan
tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

total_reports=0

for ns in "${filtered_namespaces[@]}"; do
  echo "[INFO] Gathering images in namespace: $ns"
  # Extract unique images from pods
  mapfile -t images < <(kubectl get pods -n "$ns" -o json \
    | jq -r '..|.image? // empty' \
    | sort -u)

  if [[ ${#images[@]} -eq 0 ]]; then
    echo "[WARN] No images found in namespace '$ns'"
    continue
  fi

  for img in "${images[@]}"; do
    echo "[INFO] Scanning image: $img (namespace: $ns)"
    # Run trivy image scan in JSON format
    # --ignore-unfixed reduces noise; adjust via TRIVY_EXTRA_ARGS if desired
    if ! trivy image --format json --quiet --ignore-unfixed ${TRIVY_EXTRA_ARGS:-} "$img" \
         | jq --arg ns "$ns" --arg image "$img" \
              '. as $r | {namespace: $ns, image: $image, report: $r}' \
         >> "$tmp_file"; then
      echo "[WARN] Trivy scan failed for image '$img' in namespace '$ns'"
      continue
    fi
    echo >> "$tmp_file" # newline separator for jq -s
    ((total_reports++)) || true
  done

done

# Emit consolidated JSON
if [[ -s "$tmp_file" ]]; then
  jq -s '.' "$tmp_file" > "$OUT_FILE"
else
  echo '[]' > "$OUT_FILE"
fi

echo "[INFO] Consolidated $total_reports image scan report(s) into: $OUT_FILE"
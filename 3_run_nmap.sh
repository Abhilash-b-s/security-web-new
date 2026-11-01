#!/bin/bash
set -e
OUTPUT_DIR="${OUTPUT_DIR:-new}"
[[ "$OUTPUT_DIR" = /* ]] || OUTPUT_DIR="$(pwd)/$OUTPUT_DIR"
PPWD=$(pwd)
mkdir -p "$OUTPUT_DIR"

mkdir -p "$OUTPUT_DIR/nmap"

# Serialize runs: concurrent scans (e.g. "all" + "nmap") share k8s-services.txt and nmap.json
exec 9>"$OUTPUT_DIR/nmap/.lock"
flock 9

export NMAP_EXEC=""
if [ "${SCAN_REMOTE:-}" = "1" ]; then
    # Non-local cluster: run nmap from a temporary pod inside it (always cleaned up).
    source "$PPWD/scripts/nmap_pod.sh"
    trap nmap_pod_cleanup EXIT
    trap 'kill $(jobs -p) 2>/dev/null; exit 143' TERM INT
    echo "1. Setting up Scanning Environment (temporary nmap pod in the target cluster)"
    nmap_pod_start || exit 1
else
    echo "1. Setting up Scanning Environment (Local Nmap)"
    echo "   - Using local nmap installation."
fi

echo "2. Discovering Cluster Services"
cd "$OUTPUT_DIR/nmap"
bash "$PPWD/scripts/nmap_services.sh" 2>&1 || true

echo "3. Executing Nmap Scans"
# background + wait so a TERM/INT is handled at once (the EXIT trap then deletes the temporary namespace)
bash "$PPWD/scripts/nmap_scan_from_pod.sh" & wait $! || true
echo "Nmap reports saved to: $OUTPUT_DIR/nmap/"

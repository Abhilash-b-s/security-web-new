#!/bin/bash
set -e
OUTPUT_DIR="$(pwd)/${OUTPUT_DIR:-new}"
# Copy assets to output dir to ensure they exist for reports
PPWD=$(pwd)
mkdir -p "$OUTPUT_DIR"
cp "$PPWD/security-policy-report.html" "$OUTPUT_DIR/" 2>/dev/null || true
cp "$PPWD/logo-mobile.webp" "$OUTPUT_DIR/" 2>/dev/null || true

SUB_SEPARATOR="-----------------------------------------------------------------"

KUBE_BENCH_DIR="/opt/kube-bench"
mkdir -p "$OUTPUT_DIR/kube-bench"

cd "$KUBE_BENCH_DIR"
# Try to detect K8s version using kubectl (most reliable if authenticated)
K8S_VERSION=$(kubectl version -o json 2>/dev/null | jq -r '.serverVersion.gitVersion' | sed 's/v//' | cut -d. -f1,2)

echo "$SUB_SEPARATOR"
echo ">>> Running kube-bench"
echo ""
echo -n "     • Kube Bench Scanning in Progress: "

# Construct command based on version (preserve existing logic)
if [ -n "$K8S_VERSION" ]; then
    # Using user's preference for sudo, integrated with version check
    ./kube-bench --config-dir $(pwd)/cfg --config $(pwd)/cfg/config.yaml --version "$K8S_VERSION" > "$OUTPUT_DIR/kube-bench/kubebench.txt" 2>&1 &
else
    ./kube-bench --config-dir $(pwd)/cfg --config $(pwd)/cfg/config.yaml > "$OUTPUT_DIR/kube-bench/kubebench.txt" 2>&1 &
fi

pid=$!

while kill -0 $pid 2>/dev/null; do
  echo -n "."
  sleep 2
done
wait $pid || true

echo ""
echo "     • Scanning completed"
echo "$SUB_SEPARATOR"
# Only cat if file exists and has content to avoid clutter? User request had explicit cat.
if [ -s "$OUTPUT_DIR/kube-bench/kubebench.txt" ]; then
    cat "$OUTPUT_DIR/kube-bench/kubebench.txt"
fi
echo "kube-bench report saved to: $OUTPUT_DIR/kube-bench/kubebench.txt"
cd "$PPWD"
echo ""

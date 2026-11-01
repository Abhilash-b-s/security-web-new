#!/bin/bash
set -e
# OUTPUT_DIR may be relative (to the cwd) or absolute
OUTPUT_DIR="${OUTPUT_DIR:-new}"
[[ "$OUTPUT_DIR" = /* ]] || OUTPUT_DIR="$(pwd)/$OUTPUT_DIR"
PPWD=$(pwd)
mkdir -p "$OUTPUT_DIR"

SUB_SEPARATOR="-----------------------------------------------------------------"

mkdir -p "$OUTPUT_DIR/kube-bench"

# Try to detect K8s version using kubectl (most reliable if authenticated)
K8S_VERSION=$(kubectl version -o json 2>/dev/null | jq -r '.serverVersion.gitVersion' | sed 's/v//' | cut -d. -f1,2)

echo "$SUB_SEPARATOR"
echo ">>> Running kube-bench (as a short-lived Job in security-ops)"
echo ""

# kube-bench needs hostPID and host files, so it runs in its own Job, not in this pod.
# The helper creates the Job, waits, saves its logs to kubebench.txt and deletes the Job.
rc=0
python3 "$PPWD/security-dashboard/backend/services/kubebench_job.py" \
    --output "$OUTPUT_DIR/kube-bench/kubebench.txt" --version "${K8S_VERSION:-}" || rc=$?

echo ""
echo "     • Scanning completed"
echo "$SUB_SEPARATOR"
if [ -s "$OUTPUT_DIR/kube-bench/kubebench.txt" ]; then
    cat "$OUTPUT_DIR/kube-bench/kubebench.txt"
fi
echo "kube-bench report saved to: $OUTPUT_DIR/kube-bench/kubebench.txt"
echo ""
exit $rc

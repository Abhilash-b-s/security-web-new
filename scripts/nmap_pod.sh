#!/bin/bash
# Sourced by 3_run_nmap.sh for NON-local clusters. nmap must run INSIDE the target cluster so
# <svc>.<ns>.svc.cluster.local resolves, so we create a throw-away namespace with one nmap pod
# (public image, no SA token, no privileges) via the stored KUBECONFIG and delete it afterwards.
#   nmap_pod_start   -> sets NMAP_NS and NMAP_EXEC ("kubectl exec ... --")
#   nmap_pod_cleanup -> deletes the namespace (safe to call repeatedly)
NMAP_IMAGE="${NMAP_IMAGE:-instrumentisto/nmap:latest}"
NMAP_READY_TIMEOUT="${NMAP_READY_TIMEOUT:-240}"

nmap_pod_manifest() {  # $1 = namespace
cat <<YAML
apiVersion: v1
kind: Namespace
metadata:
  name: $1
  labels: {app: sec-nmap}
---
apiVersion: v1
kind: Pod
metadata:
  name: nmap
  namespace: $1
  labels: {app: sec-nmap}
spec:
  restartPolicy: Never
  automountServiceAccountToken: false
  activeDeadlineSeconds: 14400
  securityContext:
    seccompProfile: {type: RuntimeDefault}
  containers:
  - name: nmap
    image: $NMAP_IMAGE
    imagePullPolicy: IfNotPresent
    command: ["sleep", "14400"]
    securityContext:
      allowPrivilegeEscalation: false
      privileged: false
      capabilities: {drop: ["ALL"]}
    resources:
      requests: {cpu: 50m, memory: 64Mi}
      limits: {cpu: 500m, memory: 256Mi}
YAML
}

nmap_pod_cleanup() {
  [ -n "${NMAP_NS:-}" ] || return 0
  echo "   - Deleting temporary namespace $NMAP_NS"
  kubectl delete ns "$NMAP_NS" --ignore-not-found --wait=false >/dev/null 2>&1 || echo "   ! Could not delete namespace $NMAP_NS, remove it manually"
  NMAP_NS=""
}

nmap_pod_start() {
  NMAP_NS="sec-nmap-$(head -c3 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  echo "   - Creating scanner pod in temporary namespace $NMAP_NS (image $NMAP_IMAGE)"
  if ! nmap_pod_manifest "$NMAP_NS" | kubectl create -f - >/dev/null; then
    echo "ERROR: could not create the scanner pod in the target cluster"; return 1
  fi
  if ! kubectl -n "$NMAP_NS" wait --for=condition=Ready pod/nmap --timeout="${NMAP_READY_TIMEOUT}s" >/dev/null 2>&1; then
    echo "ERROR: scanner pod not ready after ${NMAP_READY_TIMEOUT}s (image pull from the target cluster failed?)"
    kubectl -n "$NMAP_NS" get pod nmap -o jsonpath='{.status.containerStatuses[0].state}{"\n"}' 2>&1 | head -c 400
    kubectl -n "$NMAP_NS" get events 2>&1 | tail -n 4
    return 1
  fi
  # TCP connect scans only: the pod has no raw-socket capability
  NMAP_EXEC="kubectl exec -n $NMAP_NS nmap -c nmap -- env NMAP_UNPRIVILEGED=1"
  echo "   - Scanner pod ready"
}

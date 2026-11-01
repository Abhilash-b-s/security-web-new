#!/bin/bash
# Usage: ./build_and_deploy.sh [-y]     (or YES=1 ./build_and_deploy.sh)   -y skips the confirmation prompt
set -euo pipefail

REPO="quay.io/abhilash_bs1/security-dashboard"
IMAGE="$REPO:latest"
DEPLOYMENT="security-dashboard"
NAMESPACE="security-ops"
# Ingress host is <name>.<INGRESS_IP>.nip.io where INGRESS_IP is the ingress LB IP (not the node IP). Override per cluster.
INGRESS_IP="10.10.0.35"
K8S_DIR="$(dirname "$0")/security-dashboard/k8s"
# Immutable tag next to :latest so a deployed build can be identified and rolled back to
SHA_TAG="$(git -C "$(dirname "$0")" rev-parse --short HEAD)"

YES="${YES:-}"
[[ "${1:-}" == "-y" ]] && YES=1

echo "================================================="
echo "Build, Push, and Redeploy"
echo "Image: $IMAGE (and $REPO:$SHA_TAG)"
echo "Ingress IP: $INGRESS_IP"
echo "================================================="

echo "[1/4] Building Docker Image..."
docker build -t "$IMAGE" -t "$REPO:$SHA_TAG" .

echo "[2/4] Pushing to Registry..."
docker push "$IMAGE"
docker push "$REPO:$SHA_TAG"

if [[ -z "$YES" ]]; then
    echo ""
    read -p "Do you want to proceed with restarting the deployment? (y/N) " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "Deployment aborted by user."
        exit 0
    fi
fi

echo "[3/4] Applying manifests and restarting Deployment..."
sed "s/10\.10\.0\.35/${INGRESS_IP}/g" "$K8S_DIR/dashboard.yaml" | kubectl apply -f -

# Create the auth Secret only if missing; an existing Secret (real passwords) is never touched.
if kubectl get secret security-dashboard-auth -n "$NAMESPACE" >/dev/null 2>&1; then
    echo "Secret security-dashboard-auth exists, leaving it unchanged."
else
    SU_PASS="$(openssl rand -base64 18)"
    U_PASS="$(openssl rand -base64 18)"
    kubectl create secret generic security-dashboard-auth -n "$NAMESPACE" \
        --from-literal=SUPERUSER_PASSWORD="$SU_PASS" \
        --from-literal=USER_PASSWORD="$U_PASS" \
        --from-literal=AUTH_SECRET="$(openssl rand -hex 32)"
    echo "Created Secret security-dashboard-auth. Passwords are shown ONCE, store them now:"
    echo "  superuser: $SU_PASS"
    echo "  user:      $U_PASS"
fi

kubectl apply -f "$K8S_DIR/dashboard-rbac.yaml"
kubectl apply -f "$K8S_DIR/dashboard-admission-policy.yaml"
# Older deployments bound the SA to cluster-admin; apply does not remove bindings dropped from the manifest.
kubectl delete clusterrolebinding security-dashboard-admin-binding --ignore-not-found
kubectl rollout restart deployment/"$DEPLOYMENT" -n "$NAMESPACE"

echo "[4/4] Waiting for Rollout..."
kubectl rollout status deployment/"$DEPLOYMENT" -n "$NAMESPACE"

echo "================================================="
echo "SUCCESS: Deployment updated."
echo "================================================="

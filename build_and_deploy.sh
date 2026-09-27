#!/bin/bash
set -euo pipefail

IMAGE="quay.io/abhilash_bs1/security-dashboard:latest"
DEPLOYMENT="security-dashboard"
NAMESPACE="security-ops"

echo "================================================="
echo "Build, Push, and Redeploy"
echo "Image: $IMAGE"
echo "================================================="

echo "[1/4] Building Docker Image..."
docker build  -t "$IMAGE" .

echo "[2/4] Pushing to Registry..."
docker push "$IMAGE"

echo ""
read -p "Do you want to proceed with restarting the deployment? (y/N) " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Deployment aborted by user."
    exit 0
fi


echo "[3/4] Applying manifests and restarting Deployment..."
kubectl apply -f "$(dirname "$0")/security-dashboard/k8s/dashboard.yaml"
kubectl rollout restart deployment/"$DEPLOYMENT" -n "$NAMESPACE"

echo "[4/4] Waiting for Rollout..."
kubectl rollout status deployment/"$DEPLOYMENT" -n "$NAMESPACE"

echo "================================================="
echo "SUCCESS: Deployment updated."
echo "================================================="

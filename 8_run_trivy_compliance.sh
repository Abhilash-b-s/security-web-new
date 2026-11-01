#!/bin/bash
# Trivy built-in compliance specs that work without the node collector (it needs to create Jobs on nodes).
# The node-based CIS specs (k8s-cis-*, eks-cis-*, rke2-cis-*) are covered by kube-bench.
# KUBECONFIG, if set, is honoured by trivy itself.
OUTPUT_DIR="$(realpath -m "${OUTPUT_DIR:-new}")"  # relative to cwd, or absolute (per-cluster dirs)
SPECS="k8s-nsa-1.0 k8s-pss-baseline-0.1 k8s-pss-restricted-0.1"
DEST="$OUTPUT_DIR/trivy-compliance"
mkdir -p "$DEST"

failed=0
for spec in $SPECS; do
  tmp="$DEST/.$spec.json.tmp"
  if trivy k8s --no-progress --skip-version-check --timeout 300m --disable-node-collector \
       --compliance "$spec" --report all --format json -o "$tmp" && [ -s "$tmp" ]; then
    mv "$tmp" "$DEST/$spec.json"
    echo "OK    $spec -> $DEST/$spec.json"
  else
    rm -f "$tmp"
    echo "FAIL  $spec (previous report, if any, kept)"
    failed=$((failed + 1))
  fi
done

echo "Trivy compliance reports saved to: $DEST ($failed of 3 specs failed)"
[ "$failed" -lt 3 ]

#!/bin/bash
set -euo pipefail

OUTPUT_FILE="./k8s-services.txt"  # Save in current directory
> "$OUTPUT_FILE"  # Empty the file if it exists

echo "[*] Generating list of all services in the cluster with FQDN and port..."

# Get all namespaces
namespaces=$(kubectl get ns -o jsonpath='{.items[*].metadata.name}')

for ns in $namespaces; do
    # Get all services in this namespace
    services=$(kubectl get svc -n "$ns" -o jsonpath='{.items[*].metadata.name}')

    for svc in $services; do
        # Construct full DNS name
        fqdn="${svc}.${ns}.svc.cluster.local"

        # Try to fetch service ports from kubernetes:
        # returns space separated ports like "80 443"
        ports=$(kubectl get svc -n "$ns" "$svc" -o jsonpath='{.spec.ports[*].port}' 2>/dev/null || true)

        # Choose the most relevant port:
        # - if 443 present use 443
        # - else use the first port found
        # - else fallback to 443
        selected_port=""
        if [[ -n "${ports:-}" ]]; then
            # normalize whitespace then check
            for p in $ports; do
                if [ "$p" = "443" ]; then
                    selected_port="443"
                    break
                fi
            done
            if [ -z "$selected_port" ]; then
                # pick first port
                selected_port=$(echo "$ports" | awk '{print $1}')
            fi
        else
            selected_port="443"
        fi

        # Write namespace, FQDN and selected port to file (tab separated)
        echo -e "${ns}\t${fqdn}\t${selected_port}" >> "$OUTPUT_FILE"
    done
done

echo "[*] Done! Namespace-service list with FQDN and port saved to: $OUTPUT_FILE"

#!/bin/bash

# Script to run Trivy repo scans on a list of repositories from repos.txt

set -e

REPO_FILE="repos.txt"
OUTPUT_DIR="new/trivy_repo_scan"

if [ -z "$GIT_USER" ] || [ -z "$GIT_TOKEN" ]; then
    echo "Error: GIT_USER and GIT_TOKEN environment variables must be set."
    exit 1
fi

if [ ! -f "$REPO_FILE" ]; then
    echo "Error: $REPO_FILE not found!"
    exit 1
fi

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

echo "Reading repositories from $REPO_FILE..."

while IFS= read -r repo_url || [ -n "$repo_url" ]; do
    # Skip empty lines and comments
    [[ -z "$repo_url" || "$repo_url" =~ ^# ]] && continue

    echo "Scanning $repo_url..."

    # Extract repo name for filename
    repo_name=$(basename "$repo_url" .git)
    output_file="${OUTPUT_DIR}/${repo_name}.json"

    # Inject credentials into URL for authentication
    # Replaces 'https://' with 'https://USER:TOKEN@'
    # Use | as delimiter for sed to avoid escaping slashes
    auth_repo_url=$(echo "$repo_url" | sed "s|https://|https://${GIT_USER}:${GIT_TOKEN}@|")

    # Run Trivy scan
    echo "Saving output to $output_file"
    # use logical OR true to continue loop even if trivy finds vulnerabilities
    trivy repo --quiet --format json --output "$output_file" "$auth_repo_url" || echo "Trivy scan failed or found issues for $repo_url"

    echo "--------------------------------------------------"
done < "$REPO_FILE"

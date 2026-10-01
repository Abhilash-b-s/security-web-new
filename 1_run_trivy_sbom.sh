#!/bin/bash
set -e
OUTPUT_DIR="$(pwd)/${OUTPUT_DIR:-new}"

mkdir -p "$OUTPUT_DIR"

mkdir -p "$OUTPUT_DIR/trivy-sbom"


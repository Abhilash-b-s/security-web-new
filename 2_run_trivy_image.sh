#!/bin/bash
set -e
OUTPUT_DIR="${OUTPUT_DIR:-new}"
[[ "$OUTPUT_DIR" = /* ]] || OUTPUT_DIR="$(pwd)/$OUTPUT_DIR"

PPWD=$(pwd)
mkdir -p "$OUTPUT_DIR"

mkdir -p "$OUTPUT_DIR/trivy-reports"

# Scan Trivy Images
# scripts/scan-trivy-images-namspeacewise.sh expects OUTPUT_DIR var or uses default.
# It also takes an arg ALL, or namespace list.
export OUTPUT_DIR="$OUTPUT_DIR/trivy-reports" 
bash "scripts/scan-trivy-images-namspeacewise.sh" ALL
echo "Trivy image reports saved to: $OUTPUT_DIR"

echo "Generating Consolidated Excel Report..."
python3 "$PPWD/scripts/trivy_ind_jsonto_singl_report.py" --input-dir "$OUTPUT_DIR" --output-file "consolidated-report_images.xlsx"

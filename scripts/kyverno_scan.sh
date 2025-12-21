#!/bin/bash

# Script to run Kyverno scan and generate deduplicated JSON report

set -e

OUTPUT_DIR="${OUTPUT_DIR:-../new}"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
KYVERNO_POLICY_DIR="${SCRIPT_DIR}/kyvernopolicy"

mkdir -p "$OUTPUT_DIR/kyverno-report"
cd "$OUTPUT_DIR/kyverno-report"

echo "Generating all-resources.yaml..."
kubectl get pods -A -o json | python3 "$SCRIPT_DIR/kyverno_k8s_resources_to_yaml.py" > all-resources.yaml
POD_COUNT=$(kubectl get pods -A --no-headers 2>/dev/null | wc -l)
echo "Found $POD_COUNT pods to scan."

# Extract and list policy names
python3 -c "
import os, yaml
d = '$KYVERNO_POLICY_DIR'
files = sorted([f for f in os.listdir(d) if f.endswith('.yaml')])
print(f'Applying {len(files)} policies:')
for f in files:
    try:
        with open(os.path.join(d, f)) as yh:
            for doc in yaml.safe_load_all(yh):
                if doc and 'metadata' in doc and 'name' in doc['metadata']:
                    print(f'  - {doc[\"metadata\"][\"name\"]}')
    except:
        print(f'  - {f} (error reading name)')
"

echo "Running Kyverno scan (this may take a moment)..."
# Run kyverno apply
# Note: We capture stdout to the file, but let stderr go to console for progress/warnings
kyverno apply "$KYVERNO_POLICY_DIR" --resource ./all-resources.yaml --policy-report > policy-report.yaml 2>&1 || true

# Legacy workaround removed: Kyverno 1.16+ outputs clean YAML, no need to strip headers.
# tail -n +6 policy-report.yaml > policy-report.clean.yaml
# mv policy-report.clean.yaml policy-report.yaml

echo "Validating YAML..."
python3 -c "import yaml; yaml.safe_load(open('policy-report.yaml'))" && echo "Valid YAML"

echo "Converting to JSON and deduplicating..."
cat policy-report.yaml | python3 "$SCRIPT_DIR/kyverno_yaml_to_json_dedup.py" > kyverno.json

echo "Generating Excel report..."
python3 "$SCRIPT_DIR/kyverno_convert_json_to_excel.py"
mv kyverno_report.xlsx Policy_report.xlsx

echo "Zipping Kyverno report..."
zip -q kyverno.zip kyverno.json
rm kyverno.json
rm all-resources.yaml
rm policy-report.yaml

echo "Kyverno report saved to: $OUTPUT_DIR/kyverno-report/kyverno.zip"

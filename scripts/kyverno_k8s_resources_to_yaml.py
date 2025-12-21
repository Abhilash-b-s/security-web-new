import sys
import json
import yaml

try:
    data = json.load(sys.stdin)
    for item in data.get('items', []):
        print('---')
        print(yaml.dump(item, default_flow_style=False))
except Exception as e:
    print(f"Error processing JSON: {e}", file=sys.stderr)
    sys.exit(1)

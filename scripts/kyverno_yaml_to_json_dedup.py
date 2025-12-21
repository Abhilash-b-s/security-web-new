import sys
import yaml
import json
import uuid

def get_resource_key(resource):
    return (
        resource.get('apiVersion'),
        resource.get('kind'),
        resource.get('namespace'),
        resource.get('name'),
        resource.get('uid')
    )

try:
    # Load YAML from stdin
    data = yaml.safe_load(sys.stdin)
    
    policy_reports = {}
    seen_results = set()

    if data and 'results' in data:
        for result in data['results']:
            # Filter out autogen rules and skipped results
            rule_name = result.get('rule', '')
            status = result.get('result')
            
            if rule_name.startswith('autogen-') or status == 'skip':
                continue

            resources = result.get('resources', [])
            if not resources:
                continue
            
            # Assuming one resource per result for this transformation
            # Kyverno apply usually outputs one item in 'resources' list per result entry
            resource = resources[0]
            res_key = get_resource_key(resource)
            
            # Deduplication check
            # We include the resource key in the dedup key to ensure we don't dedup across different resources
            # if the same rule applied to multiple resources (though here we are grouping by resource anyway)
            dedup_key = (
                result.get('policy'),
                result.get('rule'),
                result.get('message'),
                result.get('result'),
                res_key
            )
            
            if dedup_key in seen_results:
                continue
            seen_results.add(dedup_key)
            
            # Create PolicyReport if not exists
            if res_key not in policy_reports:
                policy_reports[res_key] = {
                    "apiVersion": "wgpolicyk8s.io/v1alpha2",
                    "kind": "PolicyReport",
                    "metadata": {
                        "name": f"polr-{uuid.uuid4()}",
                        "namespace": resource.get('namespace'),
                        "labels": {
                            "app.kubernetes.io/managed-by": "kyverno"
                        },
                        "uid": str(uuid.uuid4())
                    },
                    "scope": resource,
                    "results": [],
                    "summary": {"pass": 0, "fail": 0, "warn": 0, "error": 0, "skip": 0}
                }
            
            # Clean up result object (remove 'resources' as it's now in scope)
            clean_result = result.copy()
            clean_result.pop('resources', None)
            
            # Add result
            policy_reports[res_key]['results'].append(clean_result)
            
            # Update summary
            status = result.get('result')
            if status in policy_reports[res_key]['summary']:
                policy_reports[res_key]['summary'][status] += 1

    # Convert to List
    # Convert to List
    report_items = list(policy_reports.values())
    output = {
        "apiVersion": "v1",
        "items": report_items
    }

    # Calculate and print summary statistics to stderr
    total_resources = len(report_items)
    total_pass = sum(item['summary'].get('pass', 0) for item in report_items)
    total_fail = sum(item['summary'].get('fail', 0) for item in report_items)
    total_warn = sum(item['summary'].get('warn', 0) for item in report_items)
    total_error = sum(item['summary'].get('error', 0) for item in report_items)
    total_skip = sum(item['summary'].get('skip', 0) for item in report_items)
    
    # Simple separator line
    sep = "-" * 60
    
    print(sep, file=sys.stderr)
    print("                Kyverno Scan Summary", file=sys.stderr)
    print(sep, file=sys.stderr)
    print(f"  Total Resources Scanned: {total_resources}", file=sys.stderr)
    print(sep, file=sys.stderr)
    print(f"  PASS:  {total_pass}", file=sys.stderr)
    print(f"  FAIL:  {total_fail}", file=sys.stderr)
    print(f"  WARN:  {total_warn}", file=sys.stderr)
    print(f"  ERROR: {total_error}", file=sys.stderr)
    print(f"  SKIP:  {total_skip}", file=sys.stderr)
    print(sep, file=sys.stderr)
    print("", file=sys.stderr)

    print(json.dumps(output, indent=2))

except Exception as e:
    print(f"Error processing YAML: {e}", file=sys.stderr)
    sys.exit(1)

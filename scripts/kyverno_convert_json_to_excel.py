import pandas as pd
import json
from datetime import datetime
import re
from openpyxl.utils import get_column_letter

def sanitize_for_excel(value):
    """Sanitize string values to remove illegal XML characters and handle length."""
    if not isinstance(value, str):
        return value
    # Remove control characters that are invalid in XML 1.0 (excluding tab, newline, carriage return)
    # ranges: 0-8, 11-12, 14-31
    value = re.sub(r'[\x00-\x08\x0B-\x0C\x0E-\x1F]', '', value)
    
    # Excel cell limit is 32767 characters
    if len(value) > 32700:
        return value[:32700] + '... (truncated)'
    return value

# Read the JSON file
with open('kyverno.json', 'r') as file:
    json_data = json.load(file)

# Extract the results from the items
all_results = []
for item in json_data.get('items', []):
    metadata = item.get('metadata', {})
    
    if 'results' in item:
        for result in item['results']:
            # Get resource details
            # First try to get from result (standard PolicyReport)
            if result.get('resources'):
                resources = result['resources'][0]
            # Otherwise try from item scope (deduplicated format from our script)
            elif item.get('scope'):
                resources = item['scope']
            else:
                resources = {}
            
            # Flatten the result dictionary
            flat_result = {
                # Metadata fields
                'report_name': metadata.get('name', ''),
                'report_namespace': metadata.get('namespace', ''),
                'report_creation_time': metadata.get('creationTimestamp', ''),
                'report_generation': metadata.get('generation', ''),
                'report_uid': metadata.get('uid', ''),
                'report_resource_version': metadata.get('resourceVersion', ''),
                
                # Owner reference fields
                'owner_kind': metadata.get('ownerReferences', [{}])[0].get('kind', '') if metadata.get('ownerReferences') else '',
                'owner_name': metadata.get('ownerReferences', [{}])[0].get('name', '') if metadata.get('ownerReferences') else '',
                'owner_uid': metadata.get('ownerReferences', [{}])[0].get('uid', '') if metadata.get('ownerReferences') else '',
                
                # Result fields
                'policy': result.get('policy', ''),
                'rule': result.get('rule', ''),
                'status': result.get('result', ''),
                'message': result.get('message', ''),
                'category': result.get('category', ''),
                'severity': result.get('severity', ''),
                'scoring': result.get('scoring', {}),
                
                # Resource fields
                'resource_api_version': resources.get('apiVersion', ''),
                'resource_kind': resources.get('kind', ''),
                'resource_name': resources.get('name', ''),
                'resource_namespace': resources.get('namespace', ''),
                'resource_uid': resources.get('uid', ''),
                'resource_labels': str(resources.get('labels', {})),
                'resource_annotations': str(resources.get('annotations', {})),
                
                # Additional fields
                'properties': str(result.get('properties', {})),
                'timestamp': result.get('timestamp', '')
            }
            all_results.append(flat_result)

# Convert to DataFrame
# Convert to DataFrame
df = pd.DataFrame(all_results)

# Apply sanitization to all columns
df = df.map(sanitize_for_excel)

# Reorder columns for better readability
column_order = [
    'resource_namespace', 'resource_name', 
    'resource_kind', 'policy', 'rule', 'status', 'severity', 'category', 
    'message'
]

# Reorder columns (only include columns that exist in the DataFrame)
df = df[[col for col in column_order if col in df.columns]]

# Save to Excel with auto-adjusted column widths
with pd.ExcelWriter('kyverno_report.xlsx', engine='openpyxl') as writer:
    df.to_excel(writer, index=False, sheet_name='Policy Report')
    worksheet = writer.sheets['Policy Report']
    for idx, col in enumerate(df.columns):
        # Calculate max length
        max_length = max(df[col].astype(str).apply(len).max(), len(col)) + 2
        # Use get_column_letter to safely get column letter (A, B, ... AA, AB etc.)
        col_letter = get_column_letter(idx + 1)
        worksheet.column_dimensions[col_letter].width = min(max_length, 50)  # limit to 50 characters width

print("Conversion completed! Excel file has been created as 'kyverno_report.xlsx'")
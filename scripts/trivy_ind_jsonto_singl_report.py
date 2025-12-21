import os
import json
import pandas as pd
import argparse
import sys
import re
from openpyxl.utils import get_column_letter

def sanitize_for_excel(value):
    """Sanitize string values to remove illegal XML characters and handle length."""
    if not isinstance(value, str):
        return value
        
    # Remove control characters that are invalid in XML 1.0 (excluding tab, newline, carriage return)
    # ranges: 0-8, 11-12, 14-31
    value = re.sub(r'[\x00-\x08\x0B-\x0C\x0E-\x1F]', '', value)
    
    # Prevent formula injection
    if value.startswith(('=', '+', '-', '@')):
        value = "'" + value

    # Excel cell limit is 32767 characters
    if len(value) > 32700:
        return value[:32700] + '... (truncated)'
    return value

def main():
    parser = argparse.ArgumentParser(description='Convert Trivy JSON reports to Excel.')
    parser.add_argument('--input-dir', type=str, required=True, help='Root directory containing Trivy JSON reports (subdirectories per namespace)')
    parser.add_argument('--output-file', type=str, default='consolidated-report_images.xlsx', help='Output Excel file name')
    
    args = parser.parse_args()
    
    root_dir = args.input_dir
    output_filename = args.output_file
    
    if not os.path.exists(root_dir):
        print(f"Error: Input directory '{root_dir}' does not exist.")
        sys.exit(1)

    # Initialize a list to hold the extracted data
    data = []

    print(f"Scanning for JSON files in {root_dir}...")

    # Walk through the directory structure
    for subdir, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith(".json"):
                file_path = os.path.join(subdir, file)
                folder_name = os.path.basename(subdir)
                
                try:
                    with open(file_path, 'r') as f:
                        content = json.load(f)
                        
                        # Extract general metadata
                        artifact_name = content.get('ArtifactName', 'Unknown')
                        
                        results = content.get('Results', [])
                        if not results:
                             continue

                        for result in results:
                            target = result.get('Target', 'Unknown')
                            vulnerabilities = result.get('Vulnerabilities', [])
                            
                            if not vulnerabilities:
                                continue

                            for vuln in vulnerabilities:
                                vuln_id = vuln.get('VulnerabilityID', '')
                                pkg_name = vuln.get('PkgName', '')
                                installed_version = vuln.get('InstalledVersion', '')
                                fixed_version = vuln.get('FixedVersion', '')
                                severity = vuln.get('Severity', 'UNKNOWN')
                                title = vuln.get('Title', '')
                                description = vuln.get('Description', '')
                                
                                data.append({
                                    "Namespace": folder_name,
                                    "Artifact": artifact_name,
                                    "Target": target,
                                    "Vulnerability ID": vuln_id,
                                    "Severity": severity,
                                    "Package Name": pkg_name,
                                    "Installed Version": installed_version,
                                    "Fixed Version": fixed_version,
                                    "Title": title,
                                    "Description": description
                                })
                                
                except Exception as e:
                    print(f"Error processing file {file_path}: {e}")

    if not data:
        print("No vulnerabilities found or no JSON files processed.")
        return

    # Create a DataFrame
    df = pd.DataFrame(data)

    # Apply sanitization to all columns
    # Use map/applymap depending on pandas version, map works in 2.1.0+ for entire df, applymap for older
    # Safe to use apply + apply or map.
    for col in df.columns:
        df[col] = df[col].astype(str).apply(sanitize_for_excel)

    # Define the output Excel file path
    if os.path.isabs(output_filename):
        output_path = output_filename
    else:
        output_path = os.path.join(root_dir, output_filename)

    # Write to Excel
    try:
        # Use pandas to write, ensuring it uses openpyxl
        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
             df.to_excel(writer, index=False, sheet_name='Trivy Report')
             
             # Auto-adjust column widths
             worksheet = writer.sheets['Trivy Report']
             for idx, col in enumerate(df.columns):
                 # Calculate max length
                 # Ensure we handle non-string types if any remain (though we cast to str above)
                 series = df[col].astype(str)
                 max_len = series.map(len).max()
                 # Handle case where column is empty
                 if pd.isna(max_len):
                     max_len = 0
                 
                 max_length = max(max_len, len(col)) + 2
                 col_letter = get_column_letter(idx + 1)
                 worksheet.column_dimensions[col_letter].width = min(max_length, 50)
             
        print(f"Successfully created Excel report with {len(df)} rows at {output_path}")
    except Exception as e:
        print(f"Error writing Excel file: {e}")

if __name__ == "__main__":
    main()

from fastapi import APIRouter, HTTPException
from typing import Dict, Any
import os
import json
import pandas as pd
from pathlib import Path

router = APIRouter()

# Base paths for reports
BASE_DIR = Path("/app")
NEW_DIR = BASE_DIR / "new"

@router.get(
    "/stats",
    summary="Get Dashboard Statistics",
    description="""
    Aggregate statistics from all available scan reports for dashboard visualization.

    Returns consolidated data from:
    - Kyverno policy compliance reports
    - Trivy image vulnerability scans
    - Trivy SBOM inventory
    - Nmap network security scans

    Data is extracted from Excel files and JSON reports.
    """,
    tags=["dashboard"]
)
async def get_dashboard_stats():
    """
    Extract and aggregate statistics from all available security scan reports.
    """
    stats = {
        "kyverno": {"counts": {}, "total": 0, "available": False},
        "trivyImage": {"counts": {}, "total": 0, "available": False},
        "trivySbom": {"counts": {}, "total": 0, "available": False},
        "trivyRepo": {"counts": {}, "total": 0, "available": False},
        "nmap": {"total": 0, "servicesWithWeakCiphers": 0, "available": False},
        "kubebench": {"counts": {}, "total": 0, "available": False},
        "cluster": {"counts": {}, "total": 0, "available": False}
    }

    # Load Kyverno data
    try:
        kyverno_excel = NEW_DIR / "kyverno-report" / "Policy_report.xlsx"
        if kyverno_excel.exists():
            df = pd.read_excel(kyverno_excel)
            if 'Status' in df.columns or 'status' in df.columns:
                status_col = 'Status' if 'Status' in df.columns else 'status'
                status_counts = df[status_col].value_counts().to_dict()
                # Normalize keys to uppercase
                stats["kyverno"]["counts"] = {
                    str(k).upper(): int(v) for k, v in status_counts.items()
                }
                stats["kyverno"]["total"] = int(df.shape[0])
                stats["kyverno"]["available"] = True
    except Exception as e:
        print(f"Error loading Kyverno data: {e}")

    # Fallback: Load Kyverno from JSON/ZIP
    if not stats["kyverno"]["available"]:
        try:
            kyverno_json = NEW_DIR / "kyverno-report" / "kyverno.json"
            if kyverno_json.exists():
                with open(kyverno_json, 'r') as f:
                    json_data = json.load(f)
                    items = json_data.get('items', [json_data]) if isinstance(json_data, dict) else [json_data]
                    counts = {"FAIL": 0, "WARN": 0, "ERROR": 0, "SKIP": 0, "PASS": 0}

                    for item in items:
                        if not isinstance(item, dict) or 'results' not in item:
                            continue
                        for res in item['results']:
                            status = str(res.get('result', '')).upper()
                            if status in counts:
                                counts[status] += 1

                    stats["kyverno"]["counts"] = counts
                    stats["kyverno"]["total"] = sum(counts.values())
                    stats["kyverno"]["available"] = True
        except Exception as e:
            print(f"Error loading Kyverno JSON: {e}")

    # Load Trivy Image data
    try:
        trivy_excel = NEW_DIR / "trivy-reports" / "consolidated-report_images.xlsx"
        if trivy_excel.exists():
            df = pd.read_excel(trivy_excel)
            if 'Severity' in df.columns or 'severity' in df.columns:
                sev_col = 'Severity' if 'Severity' in df.columns else 'severity'
                severity_counts = df[sev_col].value_counts().to_dict()
                stats["trivyImage"]["counts"] = {
                    str(k).upper(): int(v) for k, v in severity_counts.items()
                }
                stats["trivyImage"]["total"] = int(df.shape[0])
                stats["trivyImage"]["available"] = True
    except Exception as e:
        print(f"Error loading Trivy Image data: {e}")

    # Fallback: Load first available Trivy image JSON
    if not stats["trivyImage"]["available"]:
        try:
            trivy_reports_dir = NEW_DIR / "trivy-reports"
            if trivy_reports_dir.exists():
                json_files = sorted(trivy_reports_dir.glob("*.json"))
                if json_files:
                    with open(json_files[0], 'r') as f:
                        json_data = json.load(f)
                        results = json_data.get('Results', json_data.get('results', []))
                        counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "UNKNOWN": 0}

                        for result in results:
                            vulns = result.get('Vulnerabilities', result.get('vulnerabilities', []))
                            for vuln in vulns:
                                severity = str(vuln.get('Severity', vuln.get('severity', 'UNKNOWN'))).upper()
                                if severity in counts:
                                    counts[severity] += 1

                        stats["trivyImage"]["counts"] = counts
                        stats["trivyImage"]["total"] = sum(counts.values())
                        stats["trivyImage"]["available"] = True
        except Exception as e:
            print(f"Error loading Trivy Image JSON: {e}")

    # Load SBOM data
    try:
        sbom_json = NEW_DIR / "trivy-sbom" / "sbom.json"
        if sbom_json.exists():
            with open(sbom_json, 'r') as f:
                json_data = json.load(f)
                results = json_data.get('Results', json_data.get('results', []))
                counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "UNKNOWN": 0}

                for result in results:
                    vulns = result.get('Vulnerabilities', [])
                    for vuln in vulns:
                        severity = str(vuln.get('Severity', 'UNKNOWN')).upper()
                        if severity in counts:
                            counts[severity] += 1

                stats["trivySbom"]["counts"] = counts
                stats["trivySbom"]["total"] = sum(counts.values())
                stats["trivySbom"]["available"] = True
    except Exception as e:
        print(f"Error loading SBOM data: {e}")

    # Load Trivy Repo Scan data
    try:
        trivy_repo_dir = NEW_DIR / "trivy_repo_scan"
        if trivy_repo_dir.exists():
            json_files = sorted(trivy_repo_dir.glob("*.json"))
            if json_files:
                with open(json_files[0], 'r') as f:
                    json_data = json.load(f)
                    results = json_data.get('Results', [])
                    counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "UNKNOWN": 0}

                    for result in results:
                        # Handle Vulnerabilities
                        vulns = result.get('Vulnerabilities', [])
                        for vuln in vulns:
                            severity = str(vuln.get('Severity', 'UNKNOWN')).upper()
                            if severity in counts:
                                counts[severity] += 1

                        # Handle Secrets
                        secrets = result.get('Secrets', [])
                        for secret in secrets:
                            severity = str(secret.get('Severity', 'UNKNOWN')).upper()
                            if severity in counts:
                                counts[severity] += 1

                    stats["trivyRepo"]["counts"] = counts
                    stats["trivyRepo"]["total"] = sum(counts.values())
                    stats["trivyRepo"]["available"] = True
    except Exception as e:
        print(f"Error loading Trivy Repo data: {e}")

    # Load Nmap data
    try:
        nmap_json = NEW_DIR / "nmap" / "nmap.json"
        if nmap_json.exists():
            with open(nmap_json, 'r') as f:
                json_data = json.load(f)
                data_array = json_data if isinstance(json_data, list) else []

                services_with_weak_ciphers = 0
                total_services = len(data_array)

                for item in data_array:
                    # Count services that have at least one weak cipher
                    if len(item.get('weak_ciphers', [])) > 0:
                        services_with_weak_ciphers += 1

                stats["nmap"]["total"] = total_services
                stats["nmap"]["servicesWithWeakCiphers"] = services_with_weak_ciphers
                stats["nmap"]["available"] = True
    except Exception as e:
        print(f"Error loading Nmap data: {e}")

    # Load Kube-bench (CIS) data
    try:
        kubebench_txt = NEW_DIR / "kube-bench" / "kubebench.txt"
        if kubebench_txt.exists():
            with open(kubebench_txt, 'r') as f:
                content = f.read()
                lines = content.split('\n')
                counts = {"PASS": 0, "FAIL": 0, "WARN": 0, "INFO": 0}

                for line in lines:
                    for status in counts.keys():
                        if line.startswith(f'[{status}]'):
                            counts[status] += 1

                stats["kubebench"]["counts"] = counts
                stats["kubebench"]["total"] = sum(counts.values())
                stats["kubebench"]["available"] = True
    except Exception as e:
        print(f"Error loading Kube-bench data: {e}")

    # Load Cluster scan data
    try:
        cluster_json = NEW_DIR / "trivy-cluster-report" / "cluster.json"
        if cluster_json.exists():
            with open(cluster_json, 'r') as f:
                json_data = json.load(f)
                counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "UNKNOWN": 0}

                # Handle different Trivy cluster JSON structures
                findings = json_data.get('Findings', json_data.get('findings', []))
                resources = json_data.get('Resources', json_data.get('resources', []))
                results = json_data.get('Results', json_data.get('results', []))

                all_results = []
                for finding in findings:
                    all_results.extend(finding.get('Results', finding.get('results', [])))
                for resource in resources:
                    all_results.extend(resource.get('Results', resource.get('results', [])))
                all_results.extend(results)

                for result in all_results:
                    misconfigs = result.get('Misconfigurations', result.get('misconfigurations', []))
                    for misconfig in misconfigs:
                        severity = str(misconfig.get('Severity', misconfig.get('severity', 'UNKNOWN'))).upper()
                        if severity in counts:
                            counts[severity] += 1

                stats["cluster"]["counts"] = counts
                stats["cluster"]["total"] = sum(counts.values())
                stats["cluster"]["available"] = True
    except Exception as e:
        print(f"Error loading Cluster data: {e}")

    return stats

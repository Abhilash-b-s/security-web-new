from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any
import os
import json
import pandas as pd
from pathlib import Path
from services.cluster_context import cluster_dir

router = APIRouter()

# Base paths for reports
NEW_DIR = Path(os.getenv("NEW_DIR", "/app/new"))


def load_cluster_report(cluster: str = "local"):
    """The Trivy cluster report: cluster.json if present, otherwise the cluster.zip the scan script leaves."""
    import zipfile
    base = cluster_dir(cluster) / "trivy-cluster-report"
    if (base / "cluster.json").exists() and (base / "cluster.json").stat().st_size > 0:  # an empty file is a scan that was cut short
        return json.loads((base / "cluster.json").read_text())
    if (base / "cluster.zip").exists():
        with zipfile.ZipFile(base / "cluster.zip") as z:
            names = [n for n in z.namelist() if n.lower().endswith(".json")]
            if names:
                return json.loads(z.read(names[0]))
    return None

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
async def get_dashboard_stats(cluster: str = "local"):
    """
    Extract and aggregate statistics from all available security scan reports.
    """
    NEW_DIR = cluster_dir(cluster)
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
                # Pods failing Pod Security Standards, for the workload part of the security score
                if {'policy', 'category', 'resource_name'} <= set(df.columns):
                    pod = df['resource_namespace'].astype(str) + '/' + df['resource_name'].astype(str)
                    fail = df[status_col].astype(str).str.lower() == 'fail'
                    failing = lambda mask: set(pod[fail & mask])
                    baseline = failing(df['category'].astype(str).str.contains('Baseline'))
                    stats["kyverno"].update({
                        "pods": int(pod.nunique()),
                        "podsBaselineFail": len(baseline),
                        "podsRestrictedFail": len(failing(df['category'].astype(str).str.contains('Restricted')) - baseline),
                        "privileged": len(failing(df['policy'] == 'disallow-privileged-containers')),
                        "notNonRoot": len(failing(df['policy'] == 'require-run-as-nonroot')),
                    })
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
                # Images with a fixable critical/high CVE, for the image part of the security score
                if {'Artifact', 'Fixed Version'} <= set(df.columns):
                    fixable = df[df['Fixed Version'].fillna('').astype(str).str.strip() != '']
                    crit = set(fixable[fixable[sev_col] == 'CRITICAL']['Artifact'])
                    high = set(fixable[fixable[sev_col] == 'HIGH']['Artifact']) - crit
                    stats["trivyImage"].update({
                        "images": int(df['Artifact'].nunique()),
                        "imagesFixableCritical": len(crit),
                        "imagesFixableHigh": len(high),
                    })
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
                # One report per repository: sum them all.
                counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "UNKNOWN": 0}
                for json_file in json_files:
                    try:
                        with open(json_file, 'r') as f:
                            json_data = json.load(f)
                    except Exception as e:
                        print(f"Skipping unreadable repo report {json_file.name}: {e}")
                        continue
                    for result in json_data.get('Results') or []:
                        for item in (result.get('Vulnerabilities') or []) + (result.get('Secrets') or []):
                            severity = str(item.get('Severity', 'UNKNOWN')).upper()
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

    # Load Cluster scan data (the scan script leaves cluster.zip; cluster.json is read if present)
    try:
        json_data = load_cluster_report(cluster)
        if json_data is not None:
            counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "UNKNOWN": 0}

            # Handle different Trivy cluster JSON structures
            findings = json_data.get('Findings', json_data.get('findings', []))
            resources = json_data.get('Resources', json_data.get('resources', []))
            results = json_data.get('Results', json_data.get('results', []))

            all_results = []
            for finding in findings:
                all_results.extend(finding.get('Results', finding.get('results', [])) or [])
            for resource in resources:
                all_results.extend(resource.get('Results', resource.get('results', [])) or [])
            all_results.extend(results)

            # Misconfigurations and workload vulnerabilities, as listed in Scan reports > Cluster
            for result in all_results:
                for item in (result.get('Misconfigurations') or result.get('misconfigurations') or []) + \
                            (result.get('Vulnerabilities') or result.get('vulnerabilities') or []):
                    severity = str(item.get('Severity', item.get('severity', 'UNKNOWN'))).upper()
                    if severity in counts:
                        counts[severity] += 1

            stats["cluster"]["counts"] = counts
            stats["cluster"]["total"] = sum(counts.values())
            stats["cluster"]["available"] = True
    except Exception as e:
        print(f"Error loading Cluster data: {e}")

    return stats


@router.get(
    "/history",
    summary="Get daily history for the Overview charts",
    description="""
    Daily series for the last `days` days and the `days` before them (for period comparison).

    Each day carries the dashboard statistics from the last scan of that day (or the last known
    state if nothing ran), new and resolved findings compared with the previous scan, and the
    number of runs and failed runs per scanner. History is collected from the first scan after
    this feature was deployed; run counts come from the saved run reports.
    """,
    tags=["dashboard"]
)
async def get_dashboard_history(days: int = Query(30, ge=1, le=180), cluster: str = "local"):
    from services.history import build_history
    return build_history(days, cluster)

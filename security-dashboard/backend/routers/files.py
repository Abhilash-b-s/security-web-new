from fastapi import APIRouter, HTTPException, Query
from typing import List
import io
import json
import os
import re
from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.utils import get_column_letter
from models import ErrorResponse

router = APIRouter()

# Base directory for new reports, matching main.py logic
NEW_DIR = os.getenv("NEW_DIR", "/app/new")

@router.get(
    "/list",
    response_model=List[str],
    summary="List Files in Directory",
    description="""
    List JSON files in a specific subdirectory of the reports directory.

    This endpoint is used to browse scan output files organized by scan type.

    ## Common Subdirectories

    * `trivy-reports` - Trivy image scan results
    * `trivy-sbom` - SBOM generation outputs
    * `trivy-cluster` - Cluster scan results
    * `kube-bench` - CIS benchmark reports
    * `kyverno` - Policy validation results
    * `nmap` - Network scan outputs

    ## Security

    Path traversal attacks are prevented - you cannot access files outside
    the designated reports directory.

    ## Returns

    A list of relative file paths within the specified subdirectory.
    Only `.json` files are included in the results.
    """,
    responses={
        200: {
            "description": "List of file paths",
            "content": {
                "application/json": {
                    "example": ["report1.json", "namespace/report2.json"]
                }
            }
        },
        403: {
            "description": "Access denied - path traversal attempt",
            "model": ErrorResponse,
        },
        500: {
            "description": "Error reading directory",
            "model": ErrorResponse,
        }
    },
    tags=["files"]
)
async def list_files(subpath: str = Query(..., description="Subdirectory to list (e.g., 'trivy-reports', 'kube-bench')", examples=["trivy-reports"])):
    """
    List all JSON files in a specific subdirectory.

    Useful for browsing scan outputs organized by scan type.
    """
    target_dir = os.path.join(NEW_DIR, subpath)

    # Security check: Ensure we don't traverse out of NEW_DIR
    if not os.path.abspath(target_dir).startswith(os.path.abspath(NEW_DIR)):
         raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.exists(target_dir):
        return []

    try:
        files = []
        for root, _, filenames in os.walk(target_dir):
            for f in filenames:
                if f.endswith(".json"):
                    # Create relative path from target_dir
                    full_path = os.path.join(root, f)
                    rel_path = os.path.relpath(full_path, target_dir)
                    files.append(rel_path)
        return sorted(files)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _xlsx_cell(value):
    """Excel-safe cell text: drop XML-illegal control chars, block formula injection, cap length."""
    value = re.sub(r'[\x00-\x08\x0B-\x0C\x0E-\x1F]', '', str(value or ''))
    if value.startswith(('=', '+', '-', '@')):
        value = "'" + value
    return value[:32700]


@router.get(
    "/trivy-repo.xlsx",
    summary="Download Git repository findings as Excel",
    description="Builds one sheet with the vulnerabilities and secrets from every report in `trivy_repo_scan/`.",
)
async def download_trivy_repo_xlsx():
    repo_dir = os.path.join(NEW_DIR, "trivy_repo_scan")
    files = sorted(f for f in os.listdir(repo_dir) if f.endswith(".json")) if os.path.isdir(repo_dir) else []
    if not files:
        raise HTTPException(status_code=404, detail="No repository reports found")

    wb = Workbook()
    ws = wb.active
    ws.title = "Repository findings"
    headers = ["Repository", "Target", "Type", "ID", "Severity", "Package / Category", "Installed / Lines", "Fixed Version", "Title", "Description"]
    ws.append(headers)
    for name in files:
        try:
            with open(os.path.join(repo_dir, name)) as f:
                data = json.load(f)
        except Exception:
            continue
        repo = name[:-5]
        for res in data.get("Results") or []:
            target = res.get("Target", "")
            for v in res.get("Vulnerabilities") or []:
                ws.append([_xlsx_cell(x) for x in (repo, target, "Vulnerability", v.get("VulnerabilityID"), v.get("Severity"), v.get("PkgName"),
                                                   v.get("InstalledVersion"), v.get("FixedVersion"), v.get("Title"), v.get("Description"))])
            for s in res.get("Secrets") or []:
                ws.append([_xlsx_cell(x) for x in (repo, target, "Secret", s.get("RuleID"), s.get("Severity"), s.get("Category"),
                                                   f"Lines {s.get('StartLine')}-{s.get('EndLine')}", "", s.get("Title"), "")])
    for i, h in enumerate(headers, 1):
        ws.column_dimensions[get_column_letter(i)].width = 50 if h in ("Title", "Description") else 22
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    buf = io.BytesIO()
    wb.save(buf)
    return Response(buf.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="git-repository-findings.xlsx"'})

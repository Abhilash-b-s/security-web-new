from fastapi import APIRouter, HTTPException
from typing import List
import os
import json
from models import ScanResult, ReportListItem, ErrorResponse

router = APIRouter()
REPORTS_DIR = "security-dashboard/backend/reports"

@router.get(
    "/",
    response_model=List[ReportListItem],
    summary="List All Scan Reports",
    description="""
    Retrieve a list of all available scan reports.

    Returns summary information for each report including:
    - Scan ID
    - Timestamp
    - Scan type
    - Status

    Reports are sorted by timestamp in descending order (newest first).
    """,
    responses={
        200: {
            "description": "List of scan reports",
            "model": List[ReportListItem],
        }
    },
    tags=["reports"]
)
async def list_reports():
    """
    Get a list of all scan reports with summary information.

    This endpoint is useful for displaying a report history or
    allowing users to select a specific report to view in detail.
    """
    if not os.path.exists(REPORTS_DIR):
        return []

    reports = []
    files = sorted(os.listdir(REPORTS_DIR), reverse=True)
    for filename in files:
        if filename.endswith(".json"):
            try:
                with open(os.path.join(REPORTS_DIR, filename), "r") as f:
                    data = json.load(f)
                    # Return summary info
                    reports.append({
                        "id": data.get("id"),
                        "timestamp": data.get("timestamp"),
                        "scan_type": data.get("request", {}).get("scan_type"),
                        "status": "completed" # derived
                    })
            except Exception:
                continue
    return reports

@router.get(
    "/{report_id}",
    summary="Get Detailed Scan Report",
    description="""
    Retrieve the complete details of a specific scan report.

    Returns comprehensive information including:
    - Scan configuration and parameters
    - Execution results for each scan type
    - Detailed output and findings
    - Timestamps and status information

    Use the scan ID returned from `/api/scans/start` or obtained from `/api/reports/`.
    """,
    responses={
        200: {
            "description": "Detailed scan report",
            "content": {
                "application/json": {
                    "example": {
                        "id": "550e8400-e29b-41d4-a716-446655440000",
                        "request": {"scan_type": "trivy-image"},
                        "timestamp": "2026-01-07T10:30:00",
                        "results": [
                            {
                                "scan_type": "trivy-image",
                                "status": "completed",
                                "output": "...",
                                "timestamp": "2026-01-07T10:30:00"
                            }
                        ]
                    }
                }
            }
        },
        404: {
            "description": "Report not found",
            "model": ErrorResponse,
        },
        500: {
            "description": "Error reading report file",
            "model": ErrorResponse,
        }
    },
    tags=["reports"]
)
async def get_report(report_id: str):
    """
    Get the full details of a specific scan report by ID.

    The report contains all scan outputs, findings, and metadata.
    """
    # Security: Prevent path traversal attacks
    # Only allow alphanumeric characters and hyphens in report_id
    import re
    if not re.match(r'^[a-zA-Z0-9\-]+$', report_id):
        raise HTTPException(status_code=400, detail="Invalid report ID format")

    filepath = os.path.join(REPORTS_DIR, f"{report_id}.json")

    # Ensure the resolved path is still within REPORTS_DIR
    if not os.path.abspath(filepath).startswith(os.path.abspath(REPORTS_DIR)):
        raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Report not found")

    try:
        with open(filepath, "r") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

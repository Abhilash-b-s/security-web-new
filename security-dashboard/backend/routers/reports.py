from fastapi import APIRouter, HTTPException
from typing import List
from models import ScanResult, ReportListItem, ErrorResponse
from services import runs_store

router = APIRouter()

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
async def list_reports(cluster: str = "local"):
    """
    Get a list of all scan reports with summary information.

    This endpoint is useful for displaying a report history or
    allowing users to select a specific report to view in detail.
    """
    return runs_store.list_runs(cluster)

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

    report = runs_store.get_run(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report

from fastapi import APIRouter, HTTPException
from typing import List
import os
import json
from models import ScanResult

router = APIRouter()
REPORTS_DIR = "security-dashboard/backend/reports"

@router.get("/")
async def list_reports():
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

@router.get("/{report_id}")
async def get_report(report_id: str):
    filepath = os.path.join(REPORTS_DIR, f"{report_id}.json")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Report not found")
    
    try:
        with open(filepath, "r") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

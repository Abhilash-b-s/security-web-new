from fastapi import APIRouter, HTTPException, Query
from typing import List
import os

router = APIRouter()

# Base directory for new reports, matching main.py logic
NEW_DIR = os.getenv("NEW_DIR", "/app/new")

@router.get("/list")
async def list_files(subpath: str = Query(..., description="Subdirectory to list, e.g. 'trivy-reports'")):
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

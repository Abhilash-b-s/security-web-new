from fastapi import APIRouter, HTTPException, Query
from typing import List
import os
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

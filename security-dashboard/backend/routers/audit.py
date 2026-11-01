from fastapi import APIRouter, Query

from services import audit

router = APIRouter()


@router.get("", summary="Audit log (superuser only, newest first)", tags=["audit"])
async def get_audit(limit: int = Query(200, ge=1, le=1000), action: str = ""):
    """`action` filters by prefix, e.g. `login.` or `scan.start`."""
    return audit.recent(limit, action)

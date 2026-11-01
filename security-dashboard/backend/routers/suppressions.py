from fastapi import APIRouter, HTTPException, Request
from models import Suppression
from typing import List
import uuid
from datetime import datetime
from services import audit_hook, suppression_store

router = APIRouter()

@router.get("/", response_model=List[Suppression], tags=["suppressions"],
            summary="List all suppressed findings")
async def get_suppressions():
    return suppression_store.list_all()


@router.post("/", response_model=Suppression, tags=["suppressions"],
             summary="Suppress a finding")
async def add_suppression(s: Suppression, request: Request):
    if not s.id:
        s.id = str(uuid.uuid4())
    if not s.created_at:
        s.created_at = datetime.now().isoformat()
    suppression_store.add(s.dict())
    audit_hook.record(request, "suppression.add", s.cve_id, f"id={s.id} scan={s.scan_type} reason={s.reason} pkg={s.pkg}")
    return s.dict()


@router.delete("/{sup_id}", tags=["suppressions"],
               summary="Remove a suppression")
async def delete_suppression(sup_id: str, request: Request):
    if not suppression_store.delete(sup_id):
        raise HTTPException(status_code=404, detail="Suppression not found")
    audit_hook.record(request, "suppression.delete", sup_id)
    return {"status": "deleted", "id": sup_id}

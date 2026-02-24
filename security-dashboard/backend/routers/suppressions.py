from fastapi import APIRouter, HTTPException
from models import Suppression
from typing import List
import json
import os
import uuid
from datetime import datetime

router = APIRouter()
SUPPRESSIONS_FILE = "suppressions.json"


def load_suppressions():
    if not os.path.exists(SUPPRESSIONS_FILE):
        return []
    try:
        with open(SUPPRESSIONS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []


def save_suppressions(data):
    with open(SUPPRESSIONS_FILE, "w") as f:
        json.dump(data, f, indent=2)


@router.get("/", response_model=List[Suppression], tags=["suppressions"],
            summary="List all suppressed findings")
async def get_suppressions():
    return load_suppressions()


@router.post("/", response_model=Suppression, tags=["suppressions"],
             summary="Suppress a finding")
async def add_suppression(s: Suppression):
    sups = load_suppressions()
    if not s.id:
        s.id = str(uuid.uuid4())
    if not s.created_at:
        s.created_at = datetime.now().isoformat()
    sups.append(s.dict())
    save_suppressions(sups)
    return s.dict()


@router.delete("/{sup_id}", tags=["suppressions"],
               summary="Remove a suppression")
async def delete_suppression(sup_id: str):
    sups = load_suppressions()
    initial_len = len(sups)
    sups = [s for s in sups if s["id"] != sup_id]
    if len(sups) == initial_len:
        raise HTTPException(status_code=404, detail="Suppression not found")
    save_suppressions(sups)
    return {"status": "deleted", "id": sup_id}

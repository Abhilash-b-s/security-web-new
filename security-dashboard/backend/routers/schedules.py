"""Per-cluster scan schedules. GET is open to any authenticated user; PUT needs the superuser role
(enforced here like routers/clusters.py, since main.py's SUPERUSER_PREFIXES would also block GET)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, StrictBool

from routers.clusters import superuser
from services import audit_hook, clusters, scheduler
from services.cluster_context import valid_name

router = APIRouter()


class ScheduleBody(BaseModel):
    times: list[str]
    enabled: StrictBool


@router.get("", summary="List per-cluster scan schedules (times are UTC)")
async def list_schedules():
    return scheduler.list_all()


@router.put("/{cluster}", summary="Set a cluster's scan times (UTC HH:MM, max 6) and enabled flag")
def put_schedule(cluster: str, body: ScheduleBody, request: Request, actor: str = Depends(superuser)):
    valid_name(cluster)
    if not clusters.exists(cluster):
        raise HTTPException(status_code=404, detail="Unknown cluster")
    try:
        times = scheduler.validate_times(body.times)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    out = scheduler.update(cluster, times, body.enabled)
    audit_hook.record(request, "schedule.update", cluster, f"times={','.join(times)} enabled={body.enabled}", actor=actor, cluster=cluster)
    return out

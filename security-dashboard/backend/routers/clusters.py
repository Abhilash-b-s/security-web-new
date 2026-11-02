"""Cluster registry API. GET is open to any authenticated user; writes need the superuser role,
enforced here because main.py's SUPERUSER_PREFIXES is prefix based and GET must stay open."""
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

import auth
from services import audit, cluster_data, clusters, scanner
from services.cluster_context import LOCAL

router = APIRouter()


class ClusterCreate(BaseModel):
    name: str
    kubeconfig: str = Field(..., max_length=262144)
    context: str = ""


def superuser(authorization: str = Header("")) -> str:
    claims = auth.decode_token(authorization[7:] if authorization.lower().startswith("bearer ") else None)
    if not claims or claims.get("role") != "superuser":
        raise HTTPException(status_code=403, detail="Forbidden")
    return claims.get("sub", "-")


def _ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    return xff.split(",")[0].strip() if xff else (request.client.host if request.client else "")


@router.get("", summary="List clusters", description="Name, kind, last scan time and status. Never exposes kubeconfig content or paths.")
async def list_clusters():
    return clusters.list_all()


@router.post("", summary="Register a cluster from a kubeconfig")
def add_cluster(body: ClusterCreate, request: Request, actor: str = Depends(superuser)):
    try:
        clusters.add(body.name, body.kubeconfig, body.context.strip())
    except ValueError as e:
        audit.log_event(actor, "cluster.add.fail", body.name, str(e), _ip(request), body.name)
        raise HTTPException(status_code=400, detail=str(e))
    audit.log_event(actor, "cluster.add", body.name, "", _ip(request), body.name)
    return {"name": body.name, "status": "added"}


@router.delete("/{name}", summary="Remove a cluster; its scan data is kept unless delete_data=true")
def delete_cluster(name: str, request: Request, delete_data: bool = False, actor: str = Depends(superuser)):
    if name == LOCAL:
        raise HTTPException(status_code=400, detail="The local cluster cannot be removed")
    if delete_data and scanner.manager.list_runs():  # a running scan would write its output back after the purge
        raise HTTPException(status_code=409, detail="A scan is running. Stop it or wait for it to finish, then delete the cluster with its data.")
    if not clusters.remove(name):
        raise HTTPException(status_code=404, detail="Unknown cluster")
    removed = cluster_data.purge(name) if delete_data else None
    audit.log_event(actor, "cluster.delete", name, "scan data deleted" if delete_data else "scan data kept", _ip(request), name)
    return {"name": name, "status": "deleted", "data_deleted": delete_data, "removed": removed}


@router.post("/{name}/test", summary="Check that a cluster is reachable")
def test_cluster(name: str, request: Request, actor: str = Depends(superuser)):
    if not clusters.exists(name):
        raise HTTPException(status_code=404, detail="Unknown cluster")
    err = clusters.test(name)
    audit.log_event(actor, "cluster.test", name, err or "ok", _ip(request), name)
    return {"name": name, "ok": not err, "error": err}

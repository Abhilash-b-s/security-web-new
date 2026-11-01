"""Self-check for the multi-cluster API wiring: python3 check_clusters_api.py (needs the backend requirements).
Calls the route functions directly (no TestClient/httpx needed)."""
import asyncio
import os
import tempfile

os.environ["STATE_DIR"] = tempfile.mkdtemp()
os.environ["NEW_DIR"] = tempfile.mkdtemp()
os.environ["AUTH_SECRET"] = "s"

import auth
import main  # noqa: F401  (imports every router)
from fastapi import HTTPException
from routers import clusters as rc, dashboard, files
from starlette.requests import Request
from services import audit


def raises(code, fn, *a, **k):
    try:
        r = fn(*a, **k)
        if asyncio.iscoroutine(r):
            asyncio.run(r)
    except HTTPException as e:
        assert e.status_code == code, (e.status_code, e.detail)
        return
    raise AssertionError("no HTTPException")


su = "Bearer " + auth.make_token("superuser", "superuser")
us = "Bearer " + auth.make_token("user", "user")
req = Request({"type": "http", "headers": [], "client": ("1.2.3.4", 1)})
assert rc.superuser(su) == "superuser"
raises(403, rc.superuser, us)
raises(403, rc.superuser, "")
raises(403, rc.superuser, "Bearer junk")
assert asyncio.run(rc.list_clusters())[0]["name"] == "local"
raises(400, rc.add_cluster, rc.ClusterCreate(name="x", kubeconfig="a: ["), req, "superuser")
raises(400, rc.delete_cluster, "local", req, "superuser")
raises(404, rc.delete_cluster, "zz", req, "superuser")
raises(404, rc.test_cluster, "zz", req, "superuser")
assert "cluster.add.fail" in [a["action"] for a in audit.recent()]
# the middleware prefix list must not cover /api/clusters (GET is open to normal users; the router enforces the role)
assert not "/api/clusters".startswith(main.SUPERUSER_PREFIXES)
raises(400, dashboard.get_dashboard_stats, "../x")
assert asyncio.run(dashboard.get_dashboard_stats("nope"))["kyverno"]["available"] is False
raises(400, files.list_files, "x", "../..")
from services import clusters
raises(400, clusters.check_scan_target, "zz", "kyverno")
print("clusters api ok")

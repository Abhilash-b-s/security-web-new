"""DELETE /api/clusters/{name}: scan data is kept unless delete_data=true.
Run: STATE_DIR=$(mktemp -d) NEW_DIR=$(mktemp -d) python3 tests/test_cluster_delete.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pathlib import Path

from fastapi.testclient import TestClient

import auth
import db
import main
from services import cluster_data, scanner

NEW = Path(os.environ["NEW_DIR"])
c = TestClient(main.app)
su = {"Authorization": "Bearer " + auth.make_token("root", "superuser")}
us = {"Authorization": "Bearer " + auth.make_token("bob", "user")}


def make(name):
    with db.conn() as k:
        k.execute("INSERT OR REPLACE INTO clusters(name, kubeconfig_path, context, created_at) VALUES (?,?,?,?)", (name, f"/x/{name}", "", "now"))
        for t in cluster_data.TABLES:
            k.execute(f"INSERT INTO {t}(cluster) VALUES (?)", (name,)) if t == "cluster_schedules" else None
    (NEW / "clusters" / name / "kyverno-report").mkdir(parents=True, exist_ok=True)
    (NEW / "clusters" / name / "kyverno-report" / "kyverno.zip").write_text("x")


def rows(name):
    return db.conn().execute("SELECT COUNT(*) FROM cluster_schedules WHERE cluster=?", (name,)).fetchone()[0]


make("keepme")
assert c.delete("/api/clusters/keepme", headers=us).status_code == 403
r = c.delete("/api/clusters/keepme", headers=su)                       # default: data kept
assert r.status_code == 200 and r.json()["data_deleted"] is False and r.json()["removed"] is None, r.text
assert (NEW / "clusters" / "keepme").exists() and rows("keepme") == 1
assert not db.conn().execute("SELECT 1 FROM clusters WHERE name='keepme'").fetchone()

make("dropme")
r = c.delete("/api/clusters/dropme?delete_data=true", headers=su)      # with data
assert r.status_code == 200 and r.json()["data_deleted"] is True and r.json()["removed"]["files"] is True, r.text
assert not (NEW / "clusters" / "dropme").exists() and rows("dropme") == 0

make("busy")
scanner.manager.runs["x"] = {"scan_id": "x", "scan_type": "kyverno", "started_at": "", "lines": []}
r = c.delete("/api/clusters/busy?delete_data=true", headers=su)         # a scan is running: refuse, change nothing
assert r.status_code == 409 and (NEW / "clusters" / "busy").exists() and c.get("/api/clusters", headers=su).json()[-1]["name"] == "busy"
assert c.delete("/api/clusters/busy", headers=su).status_code == 200    # keeping the data is fine while a scan runs
scanner.manager.runs.clear()

assert c.delete("/api/clusters/local", headers=su).status_code == 400
assert c.delete("/api/clusters/nope", headers=su).status_code == 404
assert c.delete("/api/clusters/..%2Fx?delete_data=true", headers=su).status_code in (400, 404)
print("cluster delete ok")

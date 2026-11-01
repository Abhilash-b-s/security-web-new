"""One-time import of the old JSON state files into the dashboard database.

Reads suppressions.json, history.jsonl, finding_keys.json (STATE_DIR) and reports/*.json; the files
are left untouched. Runs once (a row in `migrations` marks it done), so a suppression deleted after
the import is not resurrected on the next start.
"""
import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timedelta

import db
from services import findings, history_store, runs_store, suppression_store  # noqa: F401 (creates the tables)

logger = logging.getLogger("uvicorn")
MARK = "json_import_v1"

db.ensure("CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, ts TEXT NOT NULL);")


def _json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None


def run(state_dir: str = None, reports_dir: str = None) -> dict:
    """Returns counts of what was imported ({} if already done)."""
    state_dir = state_dir or os.getenv("STATE_DIR", ".")
    reports_dir = reports_dir or os.getenv("REPORTS_DIR", "security-dashboard/backend/reports")
    if db.conn().execute("SELECT 1 FROM migrations WHERE name=?", (MARK,)).fetchone():
        return {}
    now = datetime.now().isoformat(timespec="seconds")
    n = {"suppressions": 0, "history": 0, "sources": 0, "reports": 0}

    sups = _json(os.path.join(state_dir, "suppressions.json"))
    for s in sups if isinstance(sups, list) else []:
        try:
            # entries without an id get a stable one so re-running cannot duplicate them
            s["id"] = s.get("id") or str(uuid.uuid5(uuid.NAMESPACE_OID, json.dumps(s, sort_keys=True)))
            suppression_store.add(s, ignore_dupe=True)
            n["suppressions"] += 1
        except Exception as e:
            logger.error(f"migrate: skipped suppression {s!r}: {e}")

    try:
        with open(os.path.join(state_dir, "history.jsonl")) as f:
            for raw in f:
                try:
                    history_store.add(json.loads(raw))
                    n["history"] += 1
                except Exception:
                    continue  # same tolerance as the old reader: bad lines are skipped
    except FileNotFoundError:
        pass

    # Keys last seen per source become open findings; the real first-seen dates were never stored,
    # so they start now and count as baseline (not "new").
    keys = _json(os.path.join(state_dir, "finding_keys.json"))
    if isinstance(keys, dict):
        findings.apply({src: set(v) for src, v in keys.items()}, now=now)
        n["sources"] = len(keys)

    if os.path.isdir(reports_dir):
        for name in os.listdir(reports_dir):
            r = _json(os.path.join(reports_dir, name)) if name.endswith(".json") else None
            if isinstance(r, dict) and r.get("id"):
                runs_store.save_run(r, (r.get("request") or {}).get("cluster", "local"), replace=False)
                n["reports"] += 1

    with db.conn() as c:
        c.execute("INSERT INTO migrations(name, ts) VALUES (?,?)", (MARK, now))
    logger.info(f"JSON state imported into the database: {n}")
    return n


def demo():
    import tempfile
    root = tempfile.mkdtemp()
    db.DB_PATH = os.path.join(root, "t.db")
    import importlib
    for m in (findings, history_store, runs_store, suppression_store):
        importlib.reload(m)  # re-create their tables in the temp database
    db.ensure("CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, ts TEXT NOT NULL);")
    state, reports = os.path.join(root, "state"), os.path.join(root, "reports")
    os.makedirs(state), os.makedirs(reports)
    json.dump([{"id": "s1", "cve_id": "CVE-1", "pkg": "p", "scan_type": "image", "reason": "accepted-risk", "note": "", "created_at": "2026-01-01T00:00:00"},
               {"cve_id": "CVE-2", "scan_type": "sbom", "reason": "false-positive"}], open(os.path.join(state, "suppressions.json"), "w"))
    with open(os.path.join(state, "history.jsonl"), "w") as f:
        f.write(json.dumps({"ts": "2026-01-02T10:00:00", "scan_id": "a", "scan_type": "trivy-image", "status": "completed", "new": 2, "resolved": 1, "stats": {"x": 1}}) + "\n")
        f.write("not json\n")
    json.dump({"image": ["k1", "k2"], "sbom": []}, open(os.path.join(state, "finding_keys.json"), "w"))
    json.dump({"id": "a", "request": {"scan_type": "trivy-image"}, "timestamp": "2026-01-02T10:00:00", "results": [{"scan_type": "trivy-image", "status": "completed"}]},
              open(os.path.join(reports, "a.json"), "w"))
    open(os.path.join(reports, "bad.json"), "w").write("{")

    assert run(state, reports) == {"suppressions": 2, "history": 1, "sources": 2, "reports": 1}
    assert run(state, reports) == {}  # idempotent
    assert [s["cve_id"] for s in suppression_store.list_all()] == ["CVE-1", "CVE-2"]
    assert history_store.load()[0]["stats"] == {"x": 1}
    assert runs_store.list_runs() == [{"id": "a", "timestamp": "2026-01-02T10:00:00", "scan_type": "trivy-image", "status": "completed"}]
    assert runs_store.get_run("a")["results"][0]["status"] == "completed"
    suppression_store.delete("s1")
    db.conn().execute("DELETE FROM migrations")  # force a second import: no duplicates (a deleted suppression comes back, which is why the marker exists)
    db.conn().commit()
    run(state, reports)
    assert len(runs_store.list_runs()) == 1 and len(history_store.load()) == 1 and len(suppression_store.list_all()) == 2

    # lifecycle: migrated keys are open + baseline (first_seen = import time); sbom was seen empty,
    # so a new sbom key counts as new. Times are relative to the import so the demo is clock-independent.
    base = datetime.now()
    t = lambda d: (base + timedelta(days=d)).isoformat(timespec="seconds")
    assert findings.apply({"image": {"k1", "k3"}, "sbom": {"s"}}, {"k3": "HIGH"}, now=t(1)) == (2, 1)
    assert findings.apply({"image": {"k3"}}, now=t(2)) == (0, 1)  # k1 resolved; sbom (no report) untouched
    assert findings.apply({"image": {"k1", "k3"}}, now=t(3)) == (1, 0)  # k1 is back
    first = db.conn().execute("SELECT first_seen FROM findings WHERE key='k1'").fetchone()[0]
    assert first == db.conn().execute("SELECT first_seen FROM findings WHERE key='k2'").fetchone()[0]  # k1 keeps its import-time first_seen
    assert db.conn().execute("SELECT resolved_at FROM findings WHERE key='k1'").fetchone()[0] is None
    findings.apply({"image": {"k3"}}, now=t(4))
    findings.apply({"image": {"k3", "k1"}}, now=t(5))
    assert db.conn().execute("SELECT first_seen FROM findings WHERE key='k1'").fetchone()[0] == first
    assert db.conn().execute("SELECT severity FROM findings WHERE key='k3'").fetchone()[0] == "HIGH"
    s = findings.age_summary(now=base + timedelta(days=6))
    assert (s["open"], s["new_7d"], s["resolved_7d"]) == (3, 2, 1), s  # k1/k3/s open; k3 and s are new, k1 is baseline; k2 resolved
    assert [b["count"] for b in findings.age_summary(now=base + timedelta(days=100))["buckets"]] == [0, 0, 0, 3]
    print("migrate demo ok")


if __name__ == "__main__":
    demo()

"""Scheduler tests. Run: STATE_DIR=$(mktemp -d) NEW_DIR=$(mktemp -d) python tests/test_scheduler.py"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient

import auth
import db
import main
from services import scheduler as S, scanner

U = lambda *a: datetime(*a, tzinfo=timezone.utc)
G = timedelta(hours=3)

# --- slot maths ---
t = ["02:00", "14:00"]
assert S.due_slot(t, U(2026, 1, 5, 1, 0)) == U(2026, 1, 4, 14, 0)          # midnight rollover: yesterday's last
assert S.due_slot(t, U(2026, 1, 5, 2, 0)) == U(2026, 1, 5, 2, 0)
assert S.due_slot(t, U(2026, 1, 5, 23, 59)) == U(2026, 1, 5, 14, 0)
assert S.due_slot([], U(2026, 1, 5)) is None
assert S.next_run(t, U(2026, 1, 5, 2, 0)) == U(2026, 1, 5, 14, 0)          # strictly after
assert S.next_run(t, U(2026, 1, 5, 14, 0)) == U(2026, 1, 6, 2, 0)          # rolls to tomorrow
assert S.next_run([], U(2026, 1, 5)) is None
assert S.decide(t, U(2026, 1, 5, 2, 1), None, G)[0] == "due"
assert S.decide(t, U(2026, 1, 5, 2, 1), U(2026, 1, 5, 2, 0), G)[0] is None  # already handled
assert S.decide(t, U(2026, 1, 5, 5, 1), None, G)[0] == "expired"           # grace exceeded
assert S.decide(t, U(2026, 1, 5, 5, 1), None, timedelta(hours=6))[0] == "due"
assert S.decide(t, U(2026, 1, 5, 1, 0), U(2026, 1, 4, 14, 0), G)[0] is None
assert S.run_status({"results": [{"status": "completed"}, {"status": "ScanStatus.completed"}]}) == "completed"
assert S.run_status({"results": [{"status": "completed"}, {"status": "cancelled"}]}) == "cancelled"
assert S.run_status({"results": [{"status": "completed"}, {"status": "failed"}]}) == "failed"
assert S.run_status(None) == "failed"

# --- validation ---
assert S.validate_times(["14:00", "02:00", "14:00"]) == ["02:00", "14:00"]
assert S.validate_times([]) == []
for bad in (["24:00"], ["2:00"], ["02:60"], ["02:00 "], ["ab:cd"], "02:00", [2], ["01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00"]):
    try:
        S.validate_times(bad)
        raise SystemExit(f"accepted {bad!r}")
    except ValueError:
        pass

# --- seeding ---
with db.conn() as c:
    c.execute("INSERT INTO clusters(name, kubeconfig_path, context, created_at) VALUES ('bridge-cluster','/x','', 'now')")
S.seed(); S.seed()
rows = {r["cluster"]: r for r in S.list_all()}
assert list(rows) == ["local", "bridge-cluster"], list(rows)  # local first
assert rows["local"]["times"] == ["02:00", "14:00"] and rows["bridge-cluster"]["times"] == ["04:00", "16:00"]
assert db.conn().execute("SELECT COUNT(*) FROM cluster_schedules").fetchone()[0] == 2
assert rows["local"]["enabled"] and rows["local"]["next_run_at"].endswith("Z") and rows["local"]["waiting"] is False

# --- two clusters due in the same minute: exactly one starts, the other after it finishes ---
started, gate = [], asyncio.Event()


async def fake_scan(scan_id, req):
    started.append((scan_id, req.cluster))
    await gate.wait()
    scanner.manager.end_run(scan_id)


scanner.run_scan_task = fake_scan
S.update("local", ["03:00"], True, now=U(2026, 1, 5, 2, 59))      # edits count from the moment they are made
S.update("bridge-cluster", ["03:00"], True, now=U(2026, 1, 5, 2, 59))


async def scenario():
    now = U(2026, 1, 5, 3, 0, 30)
    await S.tick(now); await asyncio.sleep(0)
    assert started == [("sched-local-202601050300", "local")], started
    v = {s["cluster"]: s for s in S.list_all(now)}
    assert v["local"]["last_scan_id"] == "sched-local-202601050300" and v["bridge-cluster"]["waiting"] is True
    await S.tick(now + timedelta(seconds=20)); await asyncio.sleep(0)
    assert len(started) == 1                                        # still blocked, not double started
    gate.set(); await asyncio.sleep(0.05)                           # first scan finishes
    assert S.get("local")["last_status"] == "failed"                # fake wrote no run report -> failed
    await S.tick(now + timedelta(seconds=40)); await asyncio.sleep(0.05)
    assert [c for _, c in started] == ["local", "bridge-cluster"], started
    assert S.get("bridge-cluster")["waiting"] is False
    await S.tick(now + timedelta(seconds=60)); await asyncio.sleep(0)
    assert len(started) == 2                                        # slot handled once only
    # grace expiry: slot 3h+ old is skipped, not run
    S.update("bridge-cluster", ["04:00"], True, now=U(2026, 1, 5, 3, 59))
    await S.tick(U(2026, 1, 5, 8, 0)); await asyncio.sleep(0)
    assert S.get("bridge-cluster")["last_status"] == "skipped" and len(started) == 2
    # a schedule saved AFTER today's slot does not run that slot retroactively (new clusters/defaults behave the same)
    S.update("bridge-cluster", ["09:00"], True, now=U(2026, 1, 6, 9, 10))
    await S.tick(U(2026, 1, 6, 9, 11)); await asyncio.sleep(0)
    assert len(started) == 2, started
    # ...but a slot that is still ahead runs
    S.update("bridge-cluster", ["09:30"], True, now=U(2026, 1, 6, 9, 12))
    await S.tick(U(2026, 1, 6, 9, 30, 5)); await asyncio.sleep(0.05)
    assert len(started) == 3 and started[-1][1] == "bridge-cluster", started

asyncio.run(scenario())

# --- API ---
c = TestClient(main.app)
su = {"Authorization": "Bearer " + auth.make_token("root", "superuser")}
us = {"Authorization": "Bearer " + auth.make_token("bob", "user")}
r = c.get("/api/schedules", headers=us)
assert r.status_code == 200 and isinstance(r.json(), list) and r.json()[0]["cluster"] == "local", r.text
body = {"times": ["15:30", "03:30", "03:30"], "enabled": True}
assert c.put("/api/schedules/local", json=body, headers=us).status_code == 403
assert c.put("/api/schedules/local", json=body).status_code == 401
r = c.put("/api/schedules/local", json=body, headers=su)
assert r.status_code == 200 and r.json()["times"] == ["03:30", "15:30"], r.text
assert set(r.json()) == {"cluster", "times", "enabled", "next_run_at", "last_run_at", "last_scan_id", "last_status", "waiting"}
assert c.put("/api/schedules/nope", json=body, headers=su).status_code == 404
assert c.put("/api/schedules/Bad_Name", json=body, headers=su).status_code == 400
assert c.put("/api/schedules/..%2Fetc", json=body, headers=su).status_code in (400, 404)
assert c.put("/api/schedules/local", json={"times": ["25:00"], "enabled": True}, headers=su).status_code == 400
assert c.put("/api/schedules/local", json={"times": [], "enabled": "yes"}, headers=su).status_code == 422
r = c.put("/api/schedules/local", json={"times": [], "enabled": False}, headers=su)
assert r.json()["next_run_at"] is None and r.json()["enabled"] is False
assert any(e["action"] == "schedule.update" and e["actor"] == "root" for e in __import__("services.audit", fromlist=["x"]).recent(50))
print("scheduler ok")

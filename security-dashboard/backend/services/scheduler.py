"""In-app scan scheduler: one schedule (UTC "HH:MM" slots) per registered cluster, stored in cluster_schedules.

Single uvicorn worker only: a second process would run its own scheduler and double-fire slots.
A restart mid scan loses the in-memory run (the scan is gone, last_status keeps its old value).
"""
import asyncio
import logging
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime, time, timedelta, timezone

import db
from models import ScanRequest, ScanType
from services import audit, clusters, runs_store, scan_guard, scanner
from services.cluster_context import LOCAL

logger = logging.getLogger(__name__)

TICK_SECONDS = 20
MAX_TIMES = 6
DEFAULT_LOCAL = "02:00,14:00"   # the old CronJob's schedule
DEFAULT_OTHER = "04:00,16:00"   # two hours after local so Trivy scans do not collide
_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

db.ensure("""
CREATE TABLE IF NOT EXISTS cluster_schedules (
    cluster TEXT PRIMARY KEY,
    times TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    last_scan_id TEXT,
    last_status TEXT,
    pending_since TEXT,
    baseline TEXT
);
""")
with db.conn() as _c:  # tables created before the baseline column existed
    if "baseline" not in [r[1] for r in _c.execute("PRAGMA table_info(cluster_schedules)")]:
        _c.execute("ALTER TABLE cluster_schedules ADD COLUMN baseline TEXT")
        _c.execute("UPDATE cluster_schedules SET baseline=? WHERE baseline IS NULL",
                   (datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),))


# ---- pure helpers (clock passed in, no wall clock) ----

def grace() -> timedelta:
    try:
        return timedelta(minutes=int(os.getenv("SCHEDULE_GRACE_MINUTES", "180")))
    except ValueError:
        return timedelta(minutes=180)


def validate_times(times) -> list:
    """Strict HH:MM list -> deduped, sorted. ValueError with a user-facing message otherwise."""
    if not isinstance(times, list) or not all(isinstance(t, str) for t in times):
        raise ValueError("times must be a list of HH:MM strings")
    bad = [t for t in times if not _HHMM.match(t)]
    if bad:
        raise ValueError(f"invalid time(s) {bad}: use 24h HH:MM (00:00-23:59, UTC)")
    out = sorted(set(times))
    if len(out) > MAX_TIMES:
        raise ValueError(f"at most {MAX_TIMES} times per cluster")
    return out


def _slot(day, hhmm: str) -> datetime:
    return datetime.combine(day, time(int(hhmm[:2]), int(hhmm[3:])), tzinfo=timezone.utc)


def due_slot(times: list, now: datetime):
    """Latest slot <= now (today, else yesterday's last one), or None."""
    for day in (now.date(), now.date() - timedelta(days=1)):
        past = [s for s in (_slot(day, t) for t in times) if s <= now]
        if past:
            return max(past)
    return None


def next_run(times: list, now: datetime):
    """First slot strictly after now, or None when there are no times."""
    if not times:
        return None
    for d in (0, 1):
        future = [s for s in (_slot(now.date() + timedelta(days=d), t) for t in times) if s > now]
        if future:
            return min(future)


def decide(times: list, now: datetime, last_run, grace_td: timedelta):
    """('due'|'expired'|None, slot): a slot not handled yet is due inside the grace window, expired after it."""
    slot = due_slot(times, now)
    if slot is None or (last_run is not None and slot <= last_run):
        return None, slot
    return ("due" if now - slot < grace_td else "expired"), slot


def run_status(run) -> str:
    """Overall status of a saved run report."""
    statuses = [str(r.get("status")) for r in (run or {}).get("results", [])]
    if any(s.endswith("cancelled") for s in statuses):
        return "cancelled"
    return "completed" if statuses and all(s.endswith("completed") for s in statuses) else "failed"


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


def _parse(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


# ---- store ----

def _split(s: str) -> list:
    return [t for t in (s or "").split(",") if t]


def _names() -> list:
    return [c["name"] for c in clusters.list_all()]  # local first, then by name


def seed() -> None:
    """Defaults for registered clusters without a row (idempotent; never overwrites an edit).
    A new schedule starts from now: slots earlier today are not run retroactively."""
    now = _iso(datetime.now(timezone.utc))
    with db.conn() as c:
        for n in _names():
            c.execute("INSERT OR IGNORE INTO cluster_schedules(cluster, times, enabled, baseline) VALUES (?,?,1,?)",
                      (n, DEFAULT_LOCAL if n == LOCAL else DEFAULT_OTHER, now))


def _view(row, now) -> dict:
    times = _split(row["times"])
    enabled = bool(row["enabled"])
    nxt = next_run(times, now) if enabled else None
    return {"cluster": row["cluster"], "times": times, "enabled": enabled, "next_run_at": _iso(nxt),
            "last_run_at": row["last_run_at"], "last_scan_id": row["last_scan_id"],
            "last_status": row["last_status"], "waiting": bool(row["pending_since"])}


def list_all(now=None) -> list:
    seed()
    now = now or datetime.now(timezone.utc)
    rows = {r["cluster"]: r for r in db.conn().execute("SELECT * FROM cluster_schedules")}
    return [_view(rows[n], now) for n in _names() if n in rows]


def get(cluster: str, now=None) -> dict:
    return next(s for s in list_all(now) if s["cluster"] == cluster)


def update(cluster: str, times: list, enabled: bool, now=None) -> dict:
    seed()
    with db.conn() as c:
        c.execute("UPDATE cluster_schedules SET times=?, enabled=?, pending_since=NULL, baseline=? WHERE cluster=?",
                  (",".join(times), int(enabled), _iso(now or datetime.now(timezone.utc)), cluster))
    return get(cluster, now)


def _set(cluster: str, **cols) -> None:
    with db.conn() as c:
        c.execute(f"UPDATE cluster_schedules SET {', '.join(k + '=?' for k in cols)} WHERE cluster=?",
                  (*cols.values(), cluster))


# ---- loop ----

_tasks = set()  # strong refs so running scans are not garbage collected


async def _run(cluster: str, scan_id: str, req: ScanRequest) -> None:
    try:
        await scanner.run_scan_task(scan_id, req)
        status = run_status(runs_store.get_run(scan_id))
    except Exception as e:
        logger.error(f"scheduled scan {scan_id} crashed: {e}")
        status = "failed"
    _set(cluster, last_status=status)


def _start(cluster: str, slot: datetime, now: datetime) -> None:
    clusters.check_scan_target(cluster, "all")
    scan_id = f"sched-{cluster}-{now.strftime('%Y%m%d%H%M')}"
    scanner.manager.start_run(scan_id, "all")
    t = asyncio.create_task(_run(cluster, scan_id, ScanRequest(scan_type=ScanType.ALL, cluster=cluster)))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
    _set(cluster, last_run_at=_iso(slot), last_scan_id=scan_id, pending_since=None)
    audit.log_event("scheduler", "scan.start", "all", f"scan_id={scan_id} cluster={cluster} scheduled", "", cluster)


async def tick(now=None) -> None:
    now = now or datetime.now(timezone.utc)
    seed()
    rows = {r["cluster"]: r for r in db.conn().execute("SELECT * FROM cluster_schedules")}
    for cluster in _names():
        row = rows.get(cluster)
        if not row or not row["enabled"]:
            if row and row["pending_since"]:
                _set(cluster, pending_since=None)
            continue
        handled = max([d for d in (_parse(row["last_run_at"]), _parse(row["baseline"])) if d], default=None)
        state, slot = decide(_split(row["times"]), now, handled, grace())
        if state == "expired":
            _set(cluster, last_run_at=_iso(slot), last_status="skipped", pending_since=None)
        elif state == "due":
            if scan_guard.conflict([r["scan_type"] for r in scanner.manager.list_runs()], "all"):
                if not row["pending_since"]:
                    _set(cluster, pending_since=_iso(now))
                continue
            try:
                _start(cluster, slot, now)
            except Exception as e:
                logger.error(f"scheduled scan for {cluster} not started: {e}")
                _set(cluster, last_run_at=_iso(slot), last_status="failed", pending_since=None)
        elif row["pending_since"]:
            _set(cluster, pending_since=None)


async def run_forever() -> None:
    while True:
        try:
            await tick()
        except Exception as e:
            logger.exception(f"scheduler tick failed: {e}")
        await asyncio.sleep(TICK_SECONDS)


@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(run_forever())
    try:
        yield
    finally:
        task.cancel()

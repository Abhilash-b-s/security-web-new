"""Per-scan run reports (what used to be reports/<scan_id>.json) in the dashboard database."""
import json
from datetime import datetime

import db

db.ensure("""
CREATE TABLE IF NOT EXISTS scan_runs (
    id TEXT PRIMARY KEY,
    cluster TEXT NOT NULL DEFAULT 'local',
    scan_type TEXT NOT NULL DEFAULT '',
    ts TEXT NOT NULL,
    report TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS scan_runs_cluster_ts ON scan_runs(cluster, ts DESC);
""")


def save_run(report: dict, cluster: str = "local", replace: bool = True) -> None:
    """report is the same dict that used to be dumped to reports/<id>.json."""
    scan_type = (report.get("request") or {}).get("scan_type", "")
    scan_type = getattr(scan_type, "value", scan_type)
    verb = "INSERT OR REPLACE" if replace else "INSERT OR IGNORE"
    with db.conn() as c:
        c.execute(f"{verb} INTO scan_runs(id, cluster, scan_type, ts, report) VALUES (?,?,?,?,?)",
                  (report["id"], cluster, str(scan_type), report.get("timestamp") or datetime.now().isoformat(),
                   json.dumps(report)))


def get_run(run_id: str):
    r = db.conn().execute("SELECT report FROM scan_runs WHERE id=?", (run_id,)).fetchone()
    return json.loads(r["report"]) if r else None


def has_run(run_id: str) -> bool:
    return db.conn().execute("SELECT 1 FROM scan_runs WHERE id=?", (run_id,)).fetchone() is not None


def list_runs(cluster: str = "local") -> list:
    """Summaries, newest first (same fields the reports list endpoint always returned)."""
    # cancelled: the user stopped it; failed: a scan in it ended with another status than completed (as the heatmap counts).
    rows = db.conn().execute(
        "SELECT id, ts, scan_type, "
        "EXISTS (SELECT 1 FROM json_each(report, '$.results') WHERE json_extract(value, '$.status') = 'cancelled') AS cancelled, "
        "EXISTS (SELECT 1 FROM json_each(report, '$.results') WHERE json_extract(value, '$.status') NOT IN ('completed', 'cancelled')) AS failed "
        "FROM scan_runs WHERE cluster=? ORDER BY ts DESC", (cluster,))
    return [{"id": r["id"], "timestamp": r["ts"], "scan_type": r["scan_type"],
             "status": "cancelled" if r["cancelled"] else "failed" if r["failed"] else "completed"} for r in rows]


def reports_since(since_iso: str, cluster: str = "local") -> list:
    """Full report dicts at or after since_iso (for the history run counts)."""
    rows = db.conn().execute("SELECT report FROM scan_runs WHERE cluster=? AND ts>=?", (cluster, since_iso))
    return [json.loads(r["report"]) for r in rows]

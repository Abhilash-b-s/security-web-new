"""Daily history snapshots (what used to be history.jsonl) in the dashboard database."""
import json

import db

db.ensure("""
CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster TEXT NOT NULL DEFAULT 'local',
    ts TEXT NOT NULL,
    scan_id TEXT NOT NULL DEFAULT '',
    scan_type TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    new INTEGER NOT NULL DEFAULT 0,
    resolved INTEGER NOT NULL DEFAULT 0,
    stats TEXT NOT NULL DEFAULT 'null',
    UNIQUE(cluster, ts, scan_id)
);
""")


def add(line: dict, cluster: str = "local") -> None:
    """line has the same shape as one history.jsonl line."""
    with db.conn() as c:
        c.execute("INSERT OR IGNORE INTO history(cluster, ts, scan_id, scan_type, status, new, resolved, stats) VALUES (?,?,?,?,?,?,?,?)",
                  (cluster, line["ts"], line.get("scan_id", ""), line.get("scan_type", ""), line.get("status", ""),
                   line.get("new", 0), line.get("resolved", 0), json.dumps(line.get("stats"))))


def load(cluster: str = "local") -> list:
    """All snapshots, oldest first (insertion order, like the append-only file)."""
    rows = db.conn().execute("SELECT * FROM history WHERE cluster=? ORDER BY id", (cluster,))
    return [{"ts": r["ts"], "scan_id": r["scan_id"], "scan_type": r["scan_type"], "status": r["status"],
             "new": r["new"], "resolved": r["resolved"], "stats": json.loads(r["stats"])} for r in rows]

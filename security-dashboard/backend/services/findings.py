"""Finding lifecycle: when each finding was first seen, last seen and (if it went away) resolved.

history.record_snapshot hands over the finding keys of the latest scan per source; apply() diffs them
against the open findings of that source, which gives the new/resolved counts for the history charts.
The first time a source is seen it is only a baseline (nothing counts as new).
"""
from datetime import datetime, timedelta

import db

db.ensure("""
CREATE TABLE IF NOT EXISTS findings (
    cluster TEXT NOT NULL DEFAULT 'local',
    source TEXT NOT NULL,
    key TEXT NOT NULL,
    severity TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    resolved_at TEXT,
    PRIMARY KEY (cluster, source, key)
);
CREATE TABLE IF NOT EXISTS finding_sources (
    cluster TEXT NOT NULL DEFAULT 'local',
    source TEXT NOT NULL,
    since TEXT NOT NULL,
    PRIMARY KEY (cluster, source)
);
""")


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def apply(current: dict, severities: dict = None, cluster: str = "local", now: str = None) -> tuple:
    """current: {source: set(keys)} from the latest scan. Returns (new, resolved) counts.
    A source missing from `current` (no report) is left untouched."""
    now, severities = now or _now(), severities or {}
    new = resolved = 0
    with db.conn() as c:
        for source, keys in current.items():
            seen = c.execute("SELECT 1 FROM finding_sources WHERE cluster=? AND source=?", (cluster, source)).fetchone()
            open_ = {r[0] for r in c.execute(
                "SELECT key FROM findings WHERE cluster=? AND source=? AND resolved_at IS NULL", (cluster, source))}
            if seen:
                new += len(keys - open_)
                resolved += len(open_ - keys)
            else:
                c.execute("INSERT INTO finding_sources(cluster, source, since) VALUES (?,?,?)", (cluster, source, now))
            c.executemany(
                "INSERT INTO findings(cluster, source, key, severity, first_seen, last_seen) VALUES (?,?,?,?,?,?) "
                "ON CONFLICT(cluster, source, key) DO UPDATE SET last_seen=excluded.last_seen, resolved_at=NULL, "
                "severity=COALESCE(excluded.severity, severity)",
                [(cluster, source, k, severities.get(k), now, now) for k in keys])
            c.executemany("UPDATE findings SET resolved_at=? WHERE cluster=? AND source=? AND key=?",
                          [(now, cluster, source, k) for k in open_ - keys])
    return new, resolved


BUCKETS = (("<7d", 0, 7), ("7-30d", 7, 30), ("30-90d", 30, 90), (">90d", 90, None))


def age_summary(cluster: str = "local", now: datetime = None) -> dict:
    """Open findings by age since first seen, plus open / new and resolved in the last 7 days.
    'New' excludes the baseline of a source (findings that were already there when it was first scanned)."""
    now = now or datetime.now()
    cut7 = (now - timedelta(days=7)).isoformat(timespec="seconds")
    q = db.conn().execute
    ages = [(now - datetime.fromisoformat(r[0])).total_seconds() / 86400 for r in q(
        "SELECT first_seen FROM findings WHERE cluster=? AND resolved_at IS NULL", (cluster,))]
    new_7d = q("SELECT COUNT(*) FROM findings f JOIN finding_sources s ON s.cluster=f.cluster AND s.source=f.source "
               "WHERE f.cluster=? AND f.resolved_at IS NULL AND f.first_seen>=? AND f.first_seen>s.since", (cluster, cut7)).fetchone()[0]
    resolved_7d = q("SELECT COUNT(*) FROM findings WHERE cluster=? AND resolved_at>=?", (cluster, cut7)).fetchone()[0]
    return {"open": len(ages), "new_7d": new_7d, "resolved_7d": resolved_7d,
            "buckets": [{"label": label, "count": sum(1 for a in ages if a >= lo and (hi is None or a < hi))}
                        for label, lo, hi in BUCKETS]}

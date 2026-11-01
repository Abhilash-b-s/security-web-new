"""Audit trail: who did what, kept in the dashboard database. Never raises: a failed write must not break the action."""
import logging
from datetime import datetime, timezone

import db

logger = logging.getLogger("audit")

db.ensure("""
CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    cluster TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_ts ON audit(ts DESC);
""")


def _add_cluster_column() -> None:
    """Databases created before the cluster column existed get it added in place (old rows keep '')."""
    with db.conn() as c:
        if "cluster" not in {r["name"] for r in c.execute("PRAGMA table_info(audit)")}:
            c.execute("ALTER TABLE audit ADD COLUMN cluster TEXT NOT NULL DEFAULT ''")


_add_cluster_column()


def log_event(actor: str, action: str, target: str = "", detail: str = "", ip: str = "", cluster: str = "") -> None:
    """action is a dotted verb such as login.ok, login.fail, scan.start, terminal.command, suppression.add, cluster.add.
    cluster is the cluster the action ran against; '' for global actions (login, settings, suppressions)."""
    try:
        with db.conn() as c:
            c.execute("INSERT INTO audit(ts, actor, action, target, detail, ip, cluster) VALUES (?,?,?,?,?,?,?)",
                      (datetime.now(timezone.utc).isoformat(timespec="seconds"), actor or "-", action, target, detail[:2000], ip, cluster))
    except Exception as e:
        logger.error(f"audit write failed: {e}")


def recent(limit: int = 200, action_prefix: str = "") -> list:
    q, args = "SELECT id, ts, actor, action, target, detail, ip, cluster FROM audit", []
    if action_prefix:
        q += " WHERE action LIKE ?"
        args.append(action_prefix + "%")
    q += " ORDER BY id DESC LIMIT ?"
    args.append(max(1, min(limit, 1000)))
    return [dict(r) for r in db.conn().execute(q, args)]


def demo():
    import os, tempfile
    db.DB_PATH = os.path.join(tempfile.mkdtemp(), "t.db")
    # Pre-cluster-column schema: the migration must add the column without losing rows.
    db.ensure("""CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL,
        action TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '')""")
    with db.conn() as c:
        c.execute("INSERT INTO audit(ts, actor, action) VALUES ('2026-01-01T00:00:00+00:00', 'old', 'login.ok')")
    _add_cluster_column()
    _add_cluster_column()  # idempotent
    log_event("superuser", "scan.start", "kyverno", "scan_id=x", "1.2.3.4", cluster="prod")
    log_event("user", "login.fail")
    assert [r["action"] for r in recent()] == ["login.fail", "scan.start", "login.ok"]
    assert [r["cluster"] for r in recent()] == ["", "prod", ""]
    assert len(recent(action_prefix="scan.")) == 1
    print("audit demo ok")


if __name__ == "__main__":
    demo()

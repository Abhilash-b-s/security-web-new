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
    ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_ts ON audit(ts DESC);
""")


def log_event(actor: str, action: str, target: str = "", detail: str = "", ip: str = "") -> None:
    """action is a dotted verb such as login.ok, login.fail, scan.start, terminal.command, suppression.add, cluster.add."""
    try:
        with db.conn() as c:
            c.execute("INSERT INTO audit(ts, actor, action, target, detail, ip) VALUES (?,?,?,?,?,?)",
                      (datetime.now(timezone.utc).isoformat(timespec="seconds"), actor or "-", action, target, detail[:2000], ip))
    except Exception as e:
        logger.error(f"audit write failed: {e}")


def recent(limit: int = 200, action_prefix: str = "") -> list:
    q, args = "SELECT id, ts, actor, action, target, detail, ip FROM audit", []
    if action_prefix:
        q += " WHERE action LIKE ?"
        args.append(action_prefix + "%")
    q += " ORDER BY id DESC LIMIT ?"
    args.append(max(1, min(limit, 1000)))
    return [dict(r) for r in db.conn().execute(q, args)]


def demo():
    import os, tempfile
    db.DB_PATH = os.path.join(tempfile.mkdtemp(), "t.db")
    db.ensure("""CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL,
        action TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '')""")
    log_event("superuser", "scan.start", "kyverno", "cluster=local", "1.2.3.4")
    log_event("user", "login.fail")
    assert [r["action"] for r in recent()] == ["login.fail", "scan.start"]
    assert len(recent(action_prefix="scan.")) == 1
    print("audit demo ok")


if __name__ == "__main__":
    demo()

"""Suppressed findings (what used to be suppressions.json) in the dashboard database."""
import db

db.ensure("""
CREATE TABLE IF NOT EXISTS suppressions (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    cve_id TEXT NOT NULL,
    pkg TEXT NOT NULL DEFAULT '',
    scan_type TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT
);
""")
_COLS = ("id", "cve_id", "pkg", "scan_type", "reason", "note", "created_at")


def list_all() -> list:
    rows = db.conn().execute(f"SELECT {', '.join(_COLS)} FROM suppressions ORDER BY seq")
    return [dict(r) for r in rows]


def add(s: dict, ignore_dupe: bool = False) -> None:
    verb = "INSERT OR IGNORE" if ignore_dupe else "INSERT"
    with db.conn() as c:
        c.execute(f"{verb} INTO suppressions({', '.join(_COLS)}) VALUES (?,?,?,?,?,?,?)",
                  (s["id"], s["cve_id"], s.get("pkg") or "", s.get("scan_type") or "", s.get("reason") or "",
                   s.get("note") or "", s.get("created_at")))


def delete(sup_id: str) -> bool:
    with db.conn() as c:
        return c.execute("DELETE FROM suppressions WHERE id=?", (sup_id,)).rowcount > 0

"""SQLite store at STATE_DIR/dashboard.db, on the persistent volume.

Each module owns its tables: it calls ensure(<CREATE TABLE IF NOT EXISTS ...>) at import time and
reads/writes through conn(). One connection per thread, WAL mode so scans and API requests do not block each other.
"""
import os
import sqlite3
import threading

STATE_DIR = os.getenv("STATE_DIR", ".")
DB_PATH = os.getenv("DB_PATH", os.path.join(STATE_DIR, "dashboard.db"))

_local = threading.local()


def conn() -> sqlite3.Connection:
    c = getattr(_local, "c", None)
    if c is None or getattr(_local, "path", None) != DB_PATH:
        os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
        c = sqlite3.connect(DB_PATH, timeout=30)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA synchronous=NORMAL")
        _local.c, _local.path = c, DB_PATH
    return c


def ensure(schema_sql: str) -> None:
    """Create a module's tables if missing (idempotent, safe to call on every start)."""
    with conn() as c:
        c.executescript(schema_sql)


def demo():
    global DB_PATH
    import tempfile
    DB_PATH = os.path.join(tempfile.mkdtemp(), "t.db")
    ensure("CREATE TABLE IF NOT EXISTS t(a INTEGER PRIMARY KEY, b TEXT)")
    ensure("CREATE TABLE IF NOT EXISTS t(a INTEGER PRIMARY KEY, b TEXT)")  # idempotent
    with conn() as c:
        c.execute("INSERT INTO t(b) VALUES ('x')")
    assert conn().execute("SELECT b FROM t").fetchone()["b"] == "x"
    assert conn().execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    print("db demo ok")


if __name__ == "__main__":
    demo()

"""Deleting the scan data of a cluster that was removed: report files, run history, findings and its schedule."""
import shutil
import sqlite3

import db
from services import clusters
from services.cluster_context import LOCAL, cluster_dir, valid_name

# every table below has a `cluster` column (see runs_store, history_store, findings, scheduler)
TABLES = ("scan_runs", "history", "findings", "finding_sources", "cluster_schedules")


def purge(name: str) -> dict:
    """Delete what is stored for `name`. Only for a cluster that is no longer registered."""
    valid_name(name)
    if name == LOCAL or clusters.exists(name):
        raise ValueError("only data of a removed cluster can be purged")
    removed = {}
    with db.conn() as c:
        for table in TABLES:
            try:
                removed[table] = c.execute(f"DELETE FROM {table} WHERE cluster=?", (name,)).rowcount
            except sqlite3.OperationalError:  # table not created on this install
                removed[table] = 0
    folder = cluster_dir(name)  # <NEW_DIR>/clusters/<name>, name already validated
    removed["files"] = folder.is_dir()
    if folder.is_dir():
        shutil.rmtree(folder)
    return removed


def demo():
    import os
    import tempfile
    from pathlib import Path
    os.environ["NEW_DIR"] = new = tempfile.mkdtemp()
    db.DB_PATH = os.path.join(tempfile.mkdtemp(), "t.db")
    db.ensure(clusters.SCHEMA)
    for t in TABLES:
        db.ensure(f"CREATE TABLE IF NOT EXISTS {t} (cluster TEXT NOT NULL, x TEXT)")
        db.conn().executemany(f"INSERT INTO {t}(cluster, x) VALUES (?, '')", [("gone",), ("gone",), ("keep",)])
    (Path(new) / "clusters" / "gone" / "kyverno-report").mkdir(parents=True)
    (Path(new) / "clusters" / "keep").mkdir(parents=True)
    r = purge("gone")
    assert r["scan_runs"] == 2 and r["cluster_schedules"] == 2 and r["files"] is True, r
    assert not (Path(new) / "clusters" / "gone").exists() and (Path(new) / "clusters" / "keep").exists()
    for t in TABLES:
        assert db.conn().execute(f"SELECT COUNT(*) FROM {t} WHERE cluster='keep'").fetchone()[0] == 1
        assert db.conn().execute(f"SELECT COUNT(*) FROM {t} WHERE cluster='gone'").fetchone()[0] == 0
    assert purge("gone")["files"] is False  # nothing left: not an error
    for bad in ("local", "../x", "A b"):
        try:
            purge(bad)
            raise SystemExit(f"accepted {bad!r}")
        except (ValueError, Exception) as e:
            assert not isinstance(e, SystemExit)
    db.conn().execute("INSERT INTO clusters(name, kubeconfig_path, context, created_at) VALUES ('live','/x','','now')")
    db.conn().commit()
    try:
        purge("live")
        raise SystemExit("purged a registered cluster")
    except ValueError:
        pass
    print("cluster_data demo ok")


if __name__ == "__main__":
    demo()

"""Cluster registry: kubeconfig validation, storage and connectivity test.

Kubeconfigs are credentials: stored 0600 in STATE_DIR/kubeconfigs (0700, not under the HTTP-served reports dir),
and their content is never returned, logged or audited.
"""
import os
import subprocess
from datetime import datetime, timezone

import yaml
from fastapi import HTTPException

import db
from services.cluster_context import LOCAL, NAME_RE, REMOTE_SCANS, kubeconfig_path, state_dir

MAX_KUBECONFIG = 256 * 1024

SCHEMA = """
CREATE TABLE IF NOT EXISTS clusters (
    name TEXT PRIMARY KEY,
    kubeconfig_path TEXT,
    context TEXT,
    created_at TEXT NOT NULL,
    last_scan_at TEXT,
    last_status TEXT
);
"""
db.ensure(SCHEMA)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def normalize_kubeconfig(text: str, context: str = "") -> tuple:
    """Parse and vet a kubeconfig; return (yaml text with current-context set, context name). Raises ValueError."""
    if len(text.encode()) > MAX_KUBECONFIG:
        raise ValueError("kubeconfig larger than 256 KB")
    try:
        cfg = yaml.safe_load(text)
    except yaml.YAMLError:
        raise ValueError("kubeconfig is not valid YAML")
    if not isinstance(cfg, dict):
        raise ValueError("kubeconfig must be a YAML mapping")
    for u in cfg.get("users") or []:
        user = (u or {}).get("user") or {}
        if "exec" in user:
            raise ValueError("user with 'exec' is not allowed (it would run a command inside the dashboard pod)")
        if "cmd-path" in ((user.get("auth-provider") or {}).get("config") or {}):
            raise ValueError("auth-provider with 'cmd-path' is not allowed (it would run a command inside the dashboard pod)")
        for k in ("tokenFile", "client-certificate", "client-key"):
            if k in user:
                raise ValueError(f"'{k}' references a local file; embed the credential (token or *-data) instead")
    for c in cfg.get("clusters") or []:
        if "certificate-authority" in ((c or {}).get("cluster") or {}):
            raise ValueError("'certificate-authority' references a local file; use certificate-authority-data")
    names = [(c or {}).get("name") for c in cfg.get("contexts") or []]
    ctx = context or cfg.get("current-context") or (names[0] if len(names) == 1 else "")
    if ctx not in names:
        raise ValueError(f"context '{ctx}' not found in kubeconfig" if ctx else "no context given and kubeconfig has no current-context")
    cfg["current-context"] = ctx
    return yaml.safe_dump(cfg), ctx


def _write_private(path, text: str) -> None:
    d = os.path.dirname(path)
    os.makedirs(d, mode=0o700, exist_ok=True)
    os.chmod(d, 0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(text)


def check_connection(path) -> str:
    """Read-only reachability probe. Returns '' on success, else a short error."""
    try:
        r = subprocess.run(["kubectl", "--kubeconfig", str(path), "get", "namespaces", "--request-timeout=15s"],
                           capture_output=True, text=True, timeout=30)
    except Exception as e:
        return f"kubectl failed: {type(e).__name__}"
    return "" if r.returncode == 0 else (r.stderr.strip() or "kubectl failed")[:300]


def add(name: str, kubeconfig: str, context: str = "") -> None:
    """Validate, probe, store. Raises ValueError with a user-facing message."""
    if name == LOCAL or not NAME_RE.match(name or ""):
        raise ValueError("name must match ^[a-z0-9][a-z0-9-]{0,30}$ and not be 'local'")
    if db.conn().execute("SELECT 1 FROM clusters WHERE name=? AND kubeconfig_path IS NOT NULL", (name,)).fetchone():
        raise ValueError("cluster already exists")
    text, ctx = normalize_kubeconfig(kubeconfig, context)
    probe = state_dir() / "kubeconfigs" / f".probe-{os.getpid()}-{name}.yaml"
    _write_private(probe, text)
    try:
        err = check_connection(probe)
    finally:
        probe.unlink(missing_ok=True)
    if err:
        raise ValueError(f"cannot reach cluster: {err}")
    path = str(kubeconfig_path(name))
    _write_private(path, text)
    with db.conn() as c:
        c.execute("INSERT OR REPLACE INTO clusters(name, kubeconfig_path, context, created_at) VALUES (?,?,?,?)", (name, path, ctx, _now()))


def remove(name: str) -> bool:
    """Forget a cluster and delete its kubeconfig; its scan data is kept."""
    with db.conn() as c:
        n = c.execute("DELETE FROM clusters WHERE name=? AND kubeconfig_path IS NOT NULL", (name,)).rowcount
    if n:
        kubeconfig_path(name).unlink(missing_ok=True)
    return bool(n)


def test(name: str) -> str:
    """'' if reachable. The local cluster uses the pod's ServiceAccount and is not probed here."""
    return "" if name == LOCAL else check_connection(kubeconfig_path(name))


def exists(name: str) -> bool:
    return name == LOCAL or bool(db.conn().execute("SELECT 1 FROM clusters WHERE name=? AND kubeconfig_path IS NOT NULL", (name,)).fetchone())


def list_all() -> list:
    rows = {r["name"]: r for r in db.conn().execute("SELECT name, kubeconfig_path, last_scan_at, last_status FROM clusters")}
    names = sorted(n for n, r in rows.items() if r["kubeconfig_path"])
    return [{"name": n, "kind": "local" if n == LOCAL else "kubeconfig",
             "last_scan_at": rows[n]["last_scan_at"] if n in rows else None,
             "last_status": rows[n]["last_status"] if n in rows else None} for n in [LOCAL] + names]


def touch(name: str, status: str) -> None:
    """Record the outcome of a scan (creates the row for 'local' on first use)."""
    with db.conn() as c:
        c.execute("INSERT INTO clusters(name, created_at, last_scan_at, last_status) VALUES (?,?,?,?) "
                  "ON CONFLICT(name) DO UPDATE SET last_scan_at=excluded.last_scan_at, last_status=excluded.last_status",
                  (name, _now(), _now(), status))


def check_scan_target(cluster: str, scan_type: str) -> None:
    """400 for an unknown cluster or a scan type that cannot run against it."""
    if not exists(cluster):
        raise HTTPException(status_code=400, detail=f"Unknown cluster '{cluster}'")
    if cluster != LOCAL and scan_type != "all" and scan_type not in REMOTE_SCANS:
        raise HTTPException(status_code=400, detail=f"'{scan_type}' only runs against the local cluster (it inspects the "
                            f"dashboard's own host/network or is cluster independent). Supported on '{cluster}': "
                            f"{', '.join(REMOTE_SCANS)}, all")


def demo():
    import tempfile
    os.environ["STATE_DIR"] = d = tempfile.mkdtemp()
    db.DB_PATH = os.path.join(d, "t.db")
    db.ensure(SCHEMA)
    ok = """
apiVersion: v1
kind: Config
current-context: a
contexts: [{name: a, context: {cluster: c, user: u}}, {name: b, context: {cluster: c, user: u}}]
clusters: [{name: c, cluster: {server: "https://x", certificate-authority-data: AAAA}}]
users: [{name: u, user: {token: t}}]
"""
    assert normalize_kubeconfig(ok)[1] == "a" and normalize_kubeconfig(ok, "b")[1] == "b"
    assert yaml.safe_load(normalize_kubeconfig(ok, "b")[0])["current-context"] == "b"
    for bad in (ok.replace("{token: t}", "{exec: {command: sh}}"), ok.replace("{token: t}", "{tokenFile: /x}"),
                ok.replace("{token: t}", "{client-key: /k}"), ok.replace("certificate-authority-data", "certificate-authority"),
                ok.replace("{token: t}", "{auth-provider: {config: {cmd-path: /bin/sh}}}"), "x: [", "- a", "x" * 300000):
        try:
            normalize_kubeconfig(bad)
            raise SystemExit("accepted bad kubeconfig")
        except ValueError:
            pass
    try:
        normalize_kubeconfig(ok, "zzz")
        raise SystemExit("accepted unknown context")
    except ValueError:
        pass
    # stub kubectl: succeeds only when the kubeconfig contains the token 't'
    stub = os.path.join(d, "bin")
    os.makedirs(stub)
    with open(os.path.join(stub, "kubectl"), "w") as f:
        f.write('#!/bin/sh\ngrep -q "token: t" "$2" || { echo "Unauthorized" >&2; exit 1; }\necho ns\n')
    os.chmod(os.path.join(stub, "kubectl"), 0o755)
    os.environ["PATH"] = stub + ":" + os.environ["PATH"]
    for badname in ("local", "Bad", "a/b", ""):
        try:
            add(badname, ok)
            raise SystemExit("accepted name")
        except ValueError:
            pass
    try:
        add("lab", ok.replace("token: t", "token: wrong"))
        raise SystemExit("stored unreachable cluster")
    except ValueError as e:
        assert "Unauthorized" in str(e)
    assert not kubeconfig_path("lab").exists() and not [f for f in os.listdir(os.path.join(d, "kubeconfigs")) if f.startswith(".probe")]
    add("lab", ok, "b")
    p = kubeconfig_path("lab")
    assert oct(p.stat().st_mode & 0o777) == "0o600" and oct(p.parent.stat().st_mode & 0o777) == "0o700"
    assert test("lab") == "" and exists("lab") and not exists("zz")
    try:
        add("lab", ok)
        raise SystemExit("dup")
    except ValueError:
        pass
    touch("lab", "completed")
    touch("local", "failed")
    ls = list_all()
    assert [c["name"] for c in ls] == ["local", "lab"] and ls[1]["last_status"] == "completed" and ls[0]["last_status"] == "failed"
    assert not any("path" in k for c in ls for k in c)
    check_scan_target("lab", "kyverno")
    check_scan_target("lab", "all")
    check_scan_target("local", "nmap")
    for st in ("nmap", "kube-bench", "trivy-repo"):
        try:
            check_scan_target("lab", st)
            raise SystemExit("allowed " + st)
        except HTTPException as e:
            assert e.status_code == 400
    try:
        check_scan_target("nope", "kyverno")
        raise SystemExit("unknown cluster")
    except HTTPException:
        pass
    assert remove("lab") and not p.exists() and not remove("lab") and not remove("local")
    print("clusters demo ok")


if __name__ == "__main__":
    demo()

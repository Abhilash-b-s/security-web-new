"""Daily history for the Overview charts.

After every scan a snapshot of the dashboard numbers is appended to
STATE_DIR/history.jsonl (on the persistent volume in Kubernetes). New and resolved
findings are found by comparing the finding keys of this scan with the previous one.
"""
import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path

logger = logging.getLogger("uvicorn")

STATE_DIR = os.getenv("STATE_DIR", ".")
HISTORY_FILE = os.path.join(STATE_DIR, "history.jsonl")
KEYS_FILE = os.path.join(STATE_DIR, "finding_keys.json")
NEW_DIR = Path(os.getenv("NEW_DIR", "/app/new"))
REPORTS_DIR = "security-dashboard/backend/reports"


def _vuln_keys(path: Path, prefix: str) -> set:
    """Keys for Trivy vulnerabilities/secrets in one JSON report."""
    keys = set()
    try:
        data = json.loads(path.read_text())
    except Exception:
        return keys
    for res in data.get("Results", data.get("results", [])) or []:
        target = res.get("Target", "")
        for v in res.get("Vulnerabilities", []) or []:
            keys.add(f"{prefix}|{target}|{v.get('VulnerabilityID', '')}|{v.get('PkgName', '')}")
        for s in res.get("Secrets", []) or []:
            keys.add(f"{prefix}|{target}|{s.get('RuleID', '')}|{s.get('StartLine', '')}")
    return keys


def _cluster_keys() -> set:
    keys = set()
    try:
        from routers.dashboard import load_cluster_report
        data = load_cluster_report()
    except Exception:
        return keys
    if data is None:
        return keys
    groups = (data.get("Findings") or data.get("findings") or []) + (data.get("Resources") or data.get("resources") or [])
    for g in groups:
        where = f"{g.get('Namespace', '')}/{g.get('Kind', '')}/{g.get('Name', '')}"
        for res in g.get("Results", g.get("results", [])) or []:
            for m in res.get("Misconfigurations", []) or []:
                keys.add(f"cluster|{where}|{m.get('ID', '')}")
            for v in res.get("Vulnerabilities", []) or []:
                keys.add(f"cluster|{where}|{v.get('VulnerabilityID', '')}|{v.get('PkgName', '')}")
    return keys


def collect_finding_keys() -> dict:
    """Current finding keys per source. A source with no report is left out."""
    out = {}
    img_dir = NEW_DIR / "trivy-reports"
    if img_dir.exists():
        keys = set()
        for f in img_dir.rglob("*.json"):
            keys |= _vuln_keys(f, f"image|{f.relative_to(img_dir)}")
        out["image"] = keys
    sbom = NEW_DIR / "trivy-sbom" / "sbom.json"
    if sbom.exists():
        out["sbom"] = _vuln_keys(sbom, "sbom")
    repo_dir = NEW_DIR / "trivy_repo_scan"
    if repo_dir.exists() and any(repo_dir.glob("*.json")):
        keys = set()
        for f in repo_dir.glob("*.json"):
            keys |= _vuln_keys(f, f"repo|{f.name}")
        out["repo"] = keys
    cluster_dir = NEW_DIR / "trivy-cluster-report"
    if (cluster_dir / "cluster.json").exists() or (cluster_dir / "cluster.zip").exists():
        out["cluster"] = _cluster_keys()
    return out


def _diff_and_store(current: dict) -> tuple:
    """New/resolved counts against the previous keys; the first time a source is seen it is a baseline."""
    try:
        with open(KEYS_FILE) as f:
            previous = {k: set(v) for k, v in json.load(f).items()}
    except Exception:
        previous = {}
    new = resolved = 0
    for source, keys in current.items():
        if source in previous:
            new += len(keys - previous[source])
            resolved += len(previous[source] - keys)
    merged = {**previous, **current}
    tmp = KEYS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump({k: sorted(v) for k, v in merged.items()}, f)
    os.replace(tmp, KEYS_FILE)
    return new, resolved


async def record_snapshot(scan_id: str, scan_type: str, status: str):
    """Append one history line. Never raises: history must not break a scan."""
    try:
        from routers.dashboard import get_dashboard_stats
        stats = await get_dashboard_stats()
        keys = await asyncio.to_thread(collect_finding_keys)
        new, resolved = await asyncio.to_thread(_diff_and_store, keys)
        line = {"ts": datetime.now().isoformat(timespec="seconds"), "scan_id": scan_id, "scan_type": scan_type,
                "status": status, "new": new, "resolved": resolved, "stats": stats}
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(HISTORY_FILE, "a") as f:
            f.write(json.dumps(line) + "\n")
    except Exception as e:
        logger.error(f"History snapshot failed for {scan_id}: {e}")


def _load_history(since: datetime) -> list:
    rows = []
    try:
        with open(HISTORY_FILE) as f:
            for raw in f:
                try:
                    r = json.loads(raw)
                    if datetime.fromisoformat(r["ts"]) >= since:
                        rows.append(r)
                except Exception:
                    continue
    except FileNotFoundError:
        pass
    return rows


def _load_runs(since: datetime) -> list:
    """Scan runs from the saved run reports (these exist even before history was collected)."""
    runs = []
    if not os.path.isdir(REPORTS_DIR):
        return runs
    for name in os.listdir(REPORTS_DIR):
        if not name.endswith(".json"):
            continue
        try:
            with open(os.path.join(REPORTS_DIR, name)) as f:
                r = json.load(f)
            ts = datetime.fromisoformat(r["timestamp"])
            if ts < since:
                continue
            results = r.get("results") or []
            failed = any(str(x.get("status")) != "completed" for x in results) or not results
            runs.append({"ts": ts, "scan_type": (r.get("request") or {}).get("scan_type", "unknown"), "failed": failed})
        except Exception:
            continue
    return runs


def build_history(days: int) -> dict:
    """Daily series for the last `days` days plus the `days` before them (for comparison)."""
    today = datetime.now().date()
    start = today - timedelta(days=2 * days - 1)
    since = datetime.combine(start, datetime.min.time())
    everything = _load_history(datetime.min)
    snaps = [s for s in everything if s["ts"] >= since.isoformat()]
    before = [s for s in everything if s["ts"] < since.isoformat()]
    runs = _load_runs(since)

    by_day = {}
    for s in snaps:
        d = s["ts"][:10]
        e = by_day.setdefault(d, {"stats": None, "new": 0, "resolved": 0, "snapshots": 0})
        e["stats"] = s["stats"]  # file is append-only, so the last line of the day wins
        e["new"] += s.get("new", 0)
        e["resolved"] += s.get("resolved", 0)
        e["snapshots"] += 1

    run_days = {}
    for r in runs:
        key = (r["ts"].date().isoformat(), r["scan_type"])
        c = run_days.setdefault(key, {"runs": 0, "failed": 0})
        c["runs"] += 1
        c["failed"] += 1 if r["failed"] else 0

    series = []
    last_stats = before[-1]["stats"] if before else None  # state carried in from before the window
    for i in range(2 * days):
        d = (start + timedelta(days=i)).isoformat()
        e = by_day.get(d)
        if e and e["stats"]:
            last_stats = e["stats"]
        series.append({
            "date": d,
            "stats": e["stats"] if e else last_stats,  # carry the last known state across days without scans
            "observed": bool(e),
            "new": e["new"] if e else 0,
            "resolved": e["resolved"] if e else 0,
            "snapshots": e["snapshots"] if e else 0,
            "runs": {st: c for (dd, st), c in run_days.items() if dd == d},
        })
    return {"days": days, "series": series, "snapshots": len(snaps), "first_snapshot": snaps[0]["ts"] if snaps else None}

"""Daily history for the Overview charts.

After every scan a snapshot of the dashboard numbers is stored in the history table
(services/history_store.py). New and resolved findings are found by comparing the finding
keys of this scan with the open findings (services/findings.py).
"""
import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path

from services import findings, history_store, runs_store
from services.cluster_context import cluster_dir

logger = logging.getLogger("uvicorn")

NEW_DIR = Path(os.getenv("NEW_DIR", "/app/new"))

# Severity of each key from the last collect_finding_keys() (stored with the finding lifecycle).
_SEVERITY = {}


def _vuln_keys(path: Path, prefix: str):
    """Keys for Trivy vulnerabilities/secrets in one JSON report, or None if the file is empty or unreadable
    (that is not "no findings": treating it so would resolve every finding and reopen them at the next scan)."""
    keys = set()
    try:
        data = json.loads(path.read_text())
    except Exception:
        return None
    for res in data.get("Results", data.get("results", [])) or []:
        target = res.get("Target", "")
        for v in res.get("Vulnerabilities", []) or []:
            k = f"{prefix}|{target}|{v.get('VulnerabilityID', '')}|{v.get('PkgName', '')}"
            keys.add(k)
            _SEVERITY[k] = v.get("Severity")
        for s in res.get("Secrets", []) or []:
            k = f"{prefix}|{target}|{s.get('RuleID', '')}|{s.get('StartLine', '')}"
            keys.add(k)
            _SEVERITY[k] = s.get("Severity")
    return keys


def _cluster_keys(cluster: str = "local"):
    """Keys of the Trivy cluster report, or None when there is no readable report."""
    keys = set()
    try:
        from routers.dashboard import load_cluster_report
        data = load_cluster_report(cluster)
    except Exception:
        return None
    if data is None:
        return None
    groups = (data.get("Findings") or data.get("findings") or []) + (data.get("Resources") or data.get("resources") or [])
    for g in groups:
        where = f"{g.get('Namespace', '')}/{g.get('Kind', '')}/{g.get('Name', '')}"
        for res in g.get("Results", g.get("results", [])) or []:
            for m in res.get("Misconfigurations", []) or []:
                k = f"cluster|{where}|{m.get('ID', '')}"
                keys.add(k)
                _SEVERITY[k] = m.get("Severity")
            for v in res.get("Vulnerabilities", []) or []:
                k = f"cluster|{where}|{v.get('VulnerabilityID', '')}|{v.get('PkgName', '')}"
                keys.add(k)
                _SEVERITY[k] = v.get("Severity")
    return keys


def _union(files, prefix_of):
    """Keys of several report files, or None if any of them is unreadable."""
    keys = set()
    for f in files:
        k = _vuln_keys(f, prefix_of(f))
        if k is None:
            return None
        keys |= k
    return keys


def collect_finding_keys(cluster: str = "local") -> dict:
    """Current finding keys per source. A source with no report, or with an unreadable one, is left out:
    its findings are neither resolved nor reopened by this snapshot."""
    found = {}
    _SEVERITY.clear()
    base = cluster_dir(cluster)
    img_dir = base / "trivy-reports"
    if img_dir.exists():
        found["image"] = _union(img_dir.rglob("*.json"), lambda f: f"image|{f.relative_to(img_dir)}")
    sbom = base / "trivy-sbom" / "sbom.json"
    if sbom.exists():
        found["sbom"] = _vuln_keys(sbom, "sbom")
    repo_dir = NEW_DIR / "trivy_repo_scan"  # source-code scans are cluster independent: local only
    if cluster == "local" and repo_dir.exists() and any(repo_dir.glob("*.json")):
        found["repo"] = _union(repo_dir.glob("*.json"), lambda f: f"repo|{f.name}")
    report_dir = base / "trivy-cluster-report"
    if (report_dir / "cluster.json").exists() or (report_dir / "cluster.zip").exists():
        found["cluster"] = _cluster_keys(cluster)
    for source in [s for s, k in found.items() if k is None]:
        logger.warning(f"Finding tracking: the {source} report of '{cluster}' is empty or unreadable, left unchanged")
    return {s: k for s, k in found.items() if k is not None}


# Which finding sources a scan can have changed. A snapshot must only look at those: after a scan of another
# kind the other reports may be half written (a stopped scan) and would be read as "everything resolved/new".
SOURCES_BY_SCAN = {"trivy-image": ("image",), "trivy-sbom": ("sbom",), "trivy-cluster": ("cluster",),
                   "trivy-repo": ("repo",), "all": ("image", "sbom", "repo", "cluster")}


async def record_snapshot(scan_id: str, scan_type: str, status: str, cluster: str = "local"):
    """Store one history snapshot. Never raises: history must not break a scan."""
    try:
        from routers.dashboard import compute_dashboard_stats
        stats = await asyncio.to_thread(compute_dashboard_stats, cluster)
        keys = await asyncio.to_thread(collect_finding_keys, cluster)
        keys = {s: k for s, k in keys.items() if s in SOURCES_BY_SCAN.get(scan_type, ())}
        new, resolved = await asyncio.to_thread(findings.apply, keys, dict(_SEVERITY), cluster)
        line = {"ts": datetime.now().isoformat(timespec="seconds"), "scan_id": scan_id, "scan_type": scan_type,
                "status": status, "new": new, "resolved": resolved, "stats": stats}
        await asyncio.to_thread(history_store.add, line, cluster)
    except Exception as e:
        logger.error(f"History snapshot failed for {scan_id}: {e}")


def _load_runs(since: datetime, cluster: str = "local") -> list:
    """Scan runs from the saved run reports (these exist even before history was collected)."""
    runs = []
    for r in runs_store.reports_since(since.isoformat(), cluster):
        try:
            ts = datetime.fromisoformat(r["timestamp"])
            results = r.get("results") or []
            scan_type = (r.get("request") or {}).get("scan_type", "unknown")
            cancelled = lambda x: str(x.get("status")) == "cancelled"  # a scan the user stopped did not run to completion: not activity
            if scan_type == "all" and results:
                # A full scan (e.g. the scheduler) counts as one run for each scanner it ran.
                for x in results:
                    if not cancelled(x):
                        runs.append({"ts": ts, "scan_type": x.get("scan_type", "unknown"), "failed": str(x.get("status")) != "completed"})
                continue
            if results and all(cancelled(x) for x in results):
                continue
            failed = any(str(x.get("status")) not in ("completed", "cancelled") for x in results) or not results
            runs.append({"ts": ts, "scan_type": scan_type, "failed": failed})
        except Exception:
            continue
    return runs


def build_history(days: int, cluster: str = "local") -> dict:
    """Daily series for the last `days` days plus the `days` before them (for comparison)."""
    today = datetime.now().date()
    start = today - timedelta(days=2 * days - 1)
    since = datetime.combine(start, datetime.min.time())
    everything = history_store.load(cluster)
    snaps = [s for s in everything if s["ts"] >= since.isoformat()]
    before = [s for s in everything if s["ts"] < since.isoformat()]
    runs = _load_runs(since, cluster)

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

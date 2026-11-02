"""A snapshot must not turn an unreadable report into "no findings", nor read sources the scan did not touch.
Run: STATE_DIR=$(mktemp -d) NEW_DIR=$(mktemp -d) python3 tests/test_history_keys.py"""
import asyncio
import json
import os
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pathlib import Path

from services import findings, history, history_store, runs_store

NEW = Path(os.environ["NEW_DIR"])
vuln = lambda vid: {"Results": [{"Target": "t", "Vulnerabilities": [{"VulnerabilityID": vid, "PkgName": "p", "Severity": "HIGH"}]}]}

(NEW / "trivy-reports" / "ns").mkdir(parents=True)
(NEW / "trivy-reports" / "ns" / "a.json").write_text(json.dumps(vuln("CVE-1")))
(NEW / "trivy-sbom").mkdir()
(NEW / "trivy-sbom" / "sbom.json").write_text(json.dumps(vuln("CVE-2")))
(NEW / "trivy-cluster-report").mkdir()
with zipfile.ZipFile(NEW / "trivy-cluster-report" / "cluster.zip", "w") as z:
    z.writestr("cluster.json", json.dumps({"Findings": [{"Namespace": "n", "Kind": "Pod", "Name": "x", "Results": [{"Misconfigurations": [{"ID": "KSV1", "Severity": "LOW"}]}]}]}))

keys = history.collect_finding_keys()
assert set(keys) == {"image", "sbom", "cluster"} and all(keys.values()), keys

# an empty cluster.json (a scan cut short) hides nothing: the zip is used, and an unreadable image report leaves the source out
(NEW / "trivy-cluster-report" / "cluster.json").write_text("")
assert "cluster" in history.collect_finding_keys()
(NEW / "trivy-cluster-report" / "cluster.zip").unlink()
assert "cluster" not in history.collect_finding_keys()          # no readable report: not "zero findings"
(NEW / "trivy-reports" / "ns" / "broken.json").write_text("{not json")
k = history.collect_finding_keys()
assert "image" not in k and "sbom" in k, k.keys()
(NEW / "trivy-reports" / "ns" / "broken.json").unlink()

# a snapshot only applies the sources its scan type covers; findings of other sources stay open
stats = {"kyverno": {"available": True, "counts": {}, "total": 0}}
import routers.dashboard as dash
dash.compute_dashboard_stats = lambda cluster="local": stats
findings.apply({"image": {"image|a|CVE-1|p"}, "sbom": {"sbom|t|CVE-2|p"}}, {}, "local")      # baseline
(NEW / "trivy-reports" / "ns" / "a.json").unlink()                                              # image report vanishes (half-written scan)
asyncio.run(history.record_snapshot("s1", "kyverno", "completed"))                              # a kyverno scan must not touch findings
row = history_store.load("local")[-1]
assert row["new"] == 0 and row["resolved"] == 0, row
asyncio.run(history.record_snapshot("s2", "trivy-image", "completed"))                          # the image scan itself does
row = history_store.load("local")[-1]
assert row["resolved"] == 1, row

# run list: cancelled / failed / completed
def run(i, statuses):
    runs_store.save_run({"id": i, "timestamp": "2026-01-01T00:00:00", "request": {"scan_type": "all"}, "results": [{"status": s} for s in statuses]}, "local")
run("r-ok", ["completed"]); run("r-cancel", ["completed", "cancelled"]); run("r-fail", ["completed", "failed"]); run("r-empty", [])
assert {r["id"]: r["status"] for r in runs_store.list_runs("local")} == {"r-ok": "completed", "r-cancel": "cancelled", "r-fail": "failed", "r-empty": "completed"}
# heatmap: a run the user stopped is not activity; a stopped scan inside a full scan is skipped, the others count
from datetime import datetime
def run2(i, scan_type, results):
    runs_store.save_run({"id": i, "timestamp": "2026-02-01T00:00:00", "request": {"scan_type": scan_type},
                         "results": [{"scan_type": t, "status": st} for t, st in results]}, "local")
run2("h-all", "all", [("kyverno", "completed"), ("trivy-image", "cancelled"), ("nmap", "failed")])
run2("h-stopped", "kyverno", [("kyverno", "cancelled")])
run2("h-single", "trivy-sbom", [("trivy-sbom", "completed")])
got = sorted((r["scan_type"], r["failed"]) for r in history._load_runs(datetime(2026, 1, 15)))
assert got == [("kyverno", False), ("nmap", True), ("trivy-sbom", False)], got
print("history keys ok")

"""Parsing and lookup of Trivy compliance reports (output of 8_run_trivy_compliance.sh)."""
import csv
import io
import json
import os
import re
from pathlib import Path
from typing import List, Optional

from fastapi import HTTPException

from services.cluster_context import cluster_dir

NEW_DIR = Path(os.getenv("NEW_DIR", "/app/new"))

# Specs that work with --disable-node-collector; keep in sync with 8_run_trivy_compliance.sh.
SPEC_IDS = ("k8s-nsa-1.0", "k8s-pss-baseline-0.1", "k8s-pss-restricted-0.1")
CLUSTER_RE = re.compile(r"^[a-z0-9-]+$")
MAX_RESOURCES = 50


def compliance_dir(cluster: str = "local") -> Path:
    """Directory holding the spec JSON files for a cluster; raises ValueError on a bad name."""
    try:
        return cluster_dir(cluster) / "trivy-compliance"
    except HTTPException as e:
        raise ValueError(e.detail)


def parse_report(raw: dict) -> dict:
    """Turn a `trivy k8s --compliance <id> --format json --report all` document into the API shape."""
    controls = []
    for c in raw.get("Results") or []:
        results = c.get("Results") or []
        failing, remediation = {}, []
        for res in results:
            for m in res.get("Misconfigurations") or []:
                if m.get("Status") != "FAIL":
                    continue
                failing[res.get("Target", "")] = None  # ordered de-dup
                fix = m.get("Resolution")
                if fix and fix not in remediation:
                    remediation.append(fix)
        # A control with no results takes its DefaultStatus: manual checks Trivy cannot evaluate count as FAIL.
        manual = not results and "DefaultStatus" in c
        failed = bool(failing) or (manual and c["DefaultStatus"] == "FAIL")
        controls.append({
            "id": c.get("ID", ""), "name": c.get("Name", ""), "description": c.get("Description", ""),
            "severity": c.get("Severity", "UNKNOWN"), "status": "FAIL" if failed else "PASS", "manual": manual,
            "failing_count": len(failing),
            "failing_resources": [
                {"kind": t.split("/", 1)[0], "namespace": "", "name": t.split("/", 1)[-1]}
                for t in list(failing)[:MAX_RESOURCES]],
            "remediation": "\n".join(remediation),
        })
    fail = sum(c["status"] == "FAIL" for c in controls)
    total = len(controls)
    return {
        "id": raw.get("ID", ""), "title": raw.get("Title", ""), "description": raw.get("Description", ""),
        "totals": {"pass": total - fail, "fail": fail, "total": total,
                   "pass_rate": round(100 * (total - fail) / total, 1) if total else 0.0},
        "controls": controls,
    }


def load_spec(spec_id: str, cluster: str = "local") -> Optional[dict]:
    """Parsed report for one spec, or None when it has not been scanned. spec_id must be in SPEC_IDS."""
    if spec_id not in SPEC_IDS:
        raise ValueError("unknown spec")
    path = compliance_dir(cluster) / f"{spec_id}.json"
    if not path.is_file():
        return None
    report = parse_report(json.loads(path.read_text()))
    report["id"] = spec_id
    report["generated_at"] = path.stat().st_mtime
    return report


def load_all(cluster: str = "local") -> List[dict]:
    return [r for r in (load_spec(s, cluster) for s in SPEC_IDS) if r]


def controls_csv(report: dict) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Control", "Name", "Severity", "Status", "Failing resources", "Remediation"])
    for c in report["controls"]:
        w.writerow([c["id"], c["name"], c["severity"], c["status"], c["failing_count"], c["remediation"]])
    return buf.getvalue()

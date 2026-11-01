"""Self-check: `python3 tests/test_compliance.py` from security-dashboard/backend (plain asserts)."""
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
os.environ["NEW_DIR"] = tempfile.mkdtemp()

from services import compliance  # noqa: E402


def check_fixture(spec_id):
    raw = json.loads((HERE / "data" / f"{spec_id}.json").read_text())
    rep = compliance.parse_report(raw)
    assert rep["id"] == spec_id and rep["totals"]["total"] == len(raw["Results"])
    # Independent count straight from the raw document: per control, the distinct targets whose own
    # MisconfSummary reports failures; a control with no results fails only via DefaultStatus.
    exp_fail = 0
    for rc, c in zip(raw["Results"], rep["controls"]):
        targets = {r["Target"] for r in rc.get("Results") or [] if r["MisconfSummary"]["Failures"] > 0}
        assert c["failing_count"] == len(targets), (spec_id, c["id"])
        assert len(c["failing_resources"]) == min(len(targets), compliance.MAX_RESOURCES)
        failed = bool(targets) or (not rc.get("Results") and rc.get("DefaultStatus") == "FAIL")
        assert c["status"] == ("FAIL" if failed else "PASS"), (spec_id, c["id"])
        assert (c["status"] == "FAIL") == (c["failing_count"] > 0 or c["manual"])
        exp_fail += failed
    t = rep["totals"]
    assert t["fail"] == exp_fail and t["pass"] + t["fail"] == t["total"]
    assert t["pass_rate"] == round(100 * t["pass"] / t["total"], 1)
    return rep


def main():
    nsa = check_fixture("k8s-nsa-1.0")
    check_fixture("k8s-pss-baseline-0.1")
    c = next(c for c in nsa["controls"] if c["id"] == "1.0")
    assert c["status"] == "FAIL" and c["remediation"] and c["failing_resources"][0]["kind"]
    assert "Control,Name" in compliance.controls_csv(nsa)

    # load_spec: allow-list, cluster names, directory layout
    for bad in ("../etc/passwd", "k8s-nsa-1.0/../x", "nope", "", "K8S-NSA-1.0"):
        try:
            compliance.load_spec(bad)
            raise AssertionError(f"accepted {bad!r}")
        except ValueError:
            pass
    for bad in ("../x", "A", "a/b", ""):
        try:
            compliance.compliance_dir(bad)
            raise AssertionError(f"accepted cluster {bad!r}")
        except ValueError:
            pass
    assert compliance.load_spec("k8s-nsa-1.0") is None  # not scanned yet
    d = compliance.compliance_dir("local")
    d.mkdir(parents=True)
    shutil.copy(HERE / "data" / "k8s-nsa-1.0.json", d)
    assert compliance.load_spec("k8s-nsa-1.0")["totals"]["total"] == nsa["totals"]["total"]
    assert compliance.compliance_dir("lab-1") == Path(os.environ["NEW_DIR"]) / "clusters/lab-1/trivy-compliance"

    # HTTP layer: bad spec ids are rejected, good one served
    from fastapi.testclient import TestClient
    from fastapi import FastAPI
    from routers import compliance as router
    app = FastAPI()
    app.include_router(router.router, prefix="/api/compliance")
    cl = TestClient(app)
    assert cl.get("/api/compliance/..%2Fetc%2Fpasswd").status_code == 404
    assert cl.get("/api/compliance/bogus").status_code == 404
    assert cl.get("/api/compliance/bogus.csv").status_code == 404
    assert cl.get("/api/compliance/k8s-nsa-1.0?cluster=../x").status_code == 400
    assert cl.get("/api/compliance/k8s-nsa-1.0").status_code == 200
    assert cl.get("/api/compliance/k8s-nsa-1.0.csv").headers["content-type"].startswith("text/csv")
    assert [s["id"] for s in cl.get("/api/compliance").json()["specs"]] == ["k8s-nsa-1.0"]
    print("ok")


if __name__ == "__main__":
    main()

"""Per-cluster paths and subprocess env. `local` is the pod's own cluster (ServiceAccount, /app/new);
other clusters scan through a stored kubeconfig and write to /app/new/clusters/<name>/ (same sub-layout)."""
import os
import re
from pathlib import Path

from fastapi import HTTPException

LOCAL = "local"
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,30}$")
# Scan types that work against a remote cluster; trivy-repo is cluster independent, kube-bench inspects the pod's own host. nmap runs from a temporary pod inside the target cluster (scripts/nmap_pod.sh).
REMOTE_SCANS = ("trivy-cluster", "trivy-sbom", "kyverno", "trivy-image", "trivy-compliance", "nmap")


def state_dir() -> Path:
    return Path(os.getenv("STATE_DIR", "."))


def valid_name(name: str) -> str:
    """Return name if it is safe to build a path from (400 otherwise). Existence is not checked here."""
    if name != LOCAL and not NAME_RE.match(name or ""):
        raise HTTPException(status_code=400, detail="Invalid cluster name")
    return name


def cluster_dir(cluster: str = LOCAL) -> Path:
    base = Path(os.getenv("NEW_DIR", "/app/new"))
    return base if valid_name(cluster) == LOCAL else base / "clusters" / cluster


def kubeconfig_path(name: str) -> Path:
    return state_dir() / "kubeconfigs" / f"{valid_name(name)}.yaml"


def scan_env(env: dict, cluster: str) -> dict:
    """Env for a scan subprocess. The stored kubeconfig already has the chosen context as current-context,
    so KUBECONFIG alone steers kubectl, `trivy k8s` and `kyverno apply` alike."""
    if cluster == LOCAL:
        return env
    out = cluster_dir(cluster)
    out.mkdir(parents=True, exist_ok=True)
    return {**env, "KUBECONFIG": str(kubeconfig_path(cluster)), "OUTPUT_DIR": str(out), "SCAN_REMOTE": "1"}


def demo():
    import tempfile
    os.environ["NEW_DIR"] = "/n"
    os.environ["STATE_DIR"] = tempfile.mkdtemp()
    assert cluster_dir() == Path("/n") and cluster_dir("a-1") == Path("/n/clusters/a-1")
    for bad in ("..", "a/b", "A", "", "-x", "x" * 32):
        try:
            cluster_dir(bad)
            raise SystemExit(f"accepted {bad!r}")
        except HTTPException:
            pass
    assert scan_env({"X": "1"}, "local") == {"X": "1"}
    os.environ["NEW_DIR"] = tempfile.mkdtemp()
    e = scan_env({"X": "1"}, "lab")
    assert e["KUBECONFIG"].endswith("kubeconfigs/lab.yaml") and Path(e["OUTPUT_DIR"]).is_dir() and e["X"] == "1"
    print("cluster_context demo ok")


if __name__ == "__main__":
    demo()

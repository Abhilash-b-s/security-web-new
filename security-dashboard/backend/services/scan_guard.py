"""Keeps Trivy scans from running at the same time (they share one Trivy cache, and two processes on it can fail)."""
from typing import Iterable, Optional


def uses_trivy(scan_type: str) -> bool:
    return scan_type.startswith("trivy-") or scan_type == "all"  # a full scan runs several Trivy scans


def conflict(running_types: Iterable[str], scan_type: str) -> Optional[str]:
    """A human-readable reason if scan_type cannot start next to the running scans, else None."""
    if uses_trivy(scan_type):
        for t in running_types:
            if uses_trivy(t):
                return (f"A Trivy scan ('{t}') is already running. Trivy scans run one at a time; "
                        f"start this one when it finishes or stop it first.")
    return None


def demo():
    assert conflict([], "trivy-image") is None
    assert conflict(["kyverno", "nmap"], "trivy-cluster") is None
    assert conflict(["trivy-sbom"], "trivy-cluster")
    assert conflict(["all"], "trivy-image")
    assert conflict(["trivy-image"], "all")
    assert conflict(["trivy-image"], "kyverno") is None
    assert conflict(["trivy-image"], "nmap") is None
    print("scan_guard demo ok")


if __name__ == "__main__":
    demo()

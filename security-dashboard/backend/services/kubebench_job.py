"""Run kube-bench as a short-lived Job instead of inside the web pod.

kube-bench needs hostPID and read-only views of /etc/kubernetes, /var/lib/kubelet and /etc/systemd.
Giving those to the always-on web pod widened its blast radius, so the dashboard creates a one-off
Job with a FIXED spec (build_job) and the ValidatingAdmissionPolicy in k8s/dashboard-admission-policy.yaml
rejects anything else the dashboard ServiceAccount tries to create. Keep the two in sync.

Usage (called by 4_run_kube_bench.sh):
    python3 kubebench_job.py --output /app/new/kube-bench/kubebench.txt [--version 1.31]
Honours KUBECONFIG (kubectl) and DASHBOARD_IMAGE. Self-check: python3 kubebench_job.py --demo
"""
import argparse
import signal
import json
import os
import secrets
import subprocess
import sys
import time

NAMESPACE = "security-ops"
# Must stay inside the allow-list in dashboard-admission-policy.yaml.
HOST_PATHS = {"etc-kubernetes": "/etc/kubernetes", "var-lib-kubelet": "/var/lib/kubelet", "etc-systemd": "/etc/systemd"}
KUBE_BENCH = "/opt/kube-bench/kube-bench"
BASE_ARGS = ["--config-dir", "/opt/kube-bench/cfg", "--config", "/opt/kube-bench/cfg/config.yaml"]
DEADLINE_SECONDS = 600


def build_job(name: str, image: str, version: str = "") -> dict:
    args = BASE_ARGS + (["--version", version] if version else [])
    return {
        "apiVersion": "batch/v1", "kind": "Job",
        "metadata": {"name": name, "namespace": NAMESPACE, "labels": {"app": "kube-bench"}},
        "spec": {
            "backoffLimit": 0,
            "activeDeadlineSeconds": DEADLINE_SECONDS,
            "ttlSecondsAfterFinished": 300,  # safety net if the dashboard dies before deleting it
            "template": {
                "metadata": {"labels": {"app": "kube-bench"}},
                "spec": {
                    "restartPolicy": "Never",
                    "hostPID": True,
                    "automountServiceAccountToken": False,  # kube-bench reads host files, it needs no API access
                    "containers": [{
                        "name": "kube-bench", "image": image, "imagePullPolicy": "IfNotPresent",
                        "command": [KUBE_BENCH], "args": args,
                        # root is needed to read root-only kubelet/etcd config; the image default user is not root.
                        "securityContext": {"runAsUser": 0, "privileged": False, "allowPrivilegeEscalation": False},
                        "volumeMounts": [{"name": n, "mountPath": p, "readOnly": True} for n, p in HOST_PATHS.items()],
                    }],
                    "volumes": [{"name": n, "hostPath": {"path": p}} for n, p in HOST_PATHS.items()],
                },
            },
        },
    }


def kubectl(*args, stdin=None):
    return subprocess.run(["kubectl", *args], input=stdin, capture_output=True, text=True)


def run(output: str, version: str, timeout: int = DEADLINE_SECONDS + 60) -> int:
    image = os.getenv("DASHBOARD_IMAGE", "quay.io/abhilash_bs1/security-dashboard:latest")
    name = f"kube-bench-{secrets.token_hex(3)}"
    os.makedirs(os.path.dirname(output), exist_ok=True)
    r = kubectl("create", "-f", "-", stdin=json.dumps(build_job(name, image, version)))
    if r.returncode != 0:
        print(f"Could not create kube-bench Job: {r.stderr.strip()}")
        return 1
    print(f"Created Job {NAMESPACE}/{name}, waiting for it to finish...", flush=True)
    code = 1
    try:
        deadline = time.time() + timeout
        while time.time() < deadline:
            r = kubectl("get", "job", name, "-n", NAMESPACE, "-o", "json")
            st = json.loads(r.stdout).get("status", {}) if r.returncode == 0 else {}
            if st.get("succeeded"):
                code = 0
                break
            if st.get("failed"):
                print("kube-bench Job failed (see log below)")
                break
            time.sleep(3)
        else:
            print(f"kube-bench Job did not finish within {timeout}s")
        # Same content as before: kube-bench's combined stdout+stderr.
        logs = kubectl("logs", f"job/{name}", "-n", NAMESPACE)
        with open(output, "w") as f:
            f.write(logs.stdout + logs.stderr if logs.returncode == 0 else logs.stderr)
    finally:
        kubectl("delete", "job", name, "-n", NAMESPACE, "--ignore-not-found", "--wait=false")
    return code


def demo():
    job = build_job("kube-bench-abc123", "img:1", "1.31")
    pod = job["spec"]["template"]["spec"]
    c = pod["containers"][0]
    assert pod["hostPID"] and not pod.get("hostNetwork") and len(pod["containers"]) == 1
    assert all(m["readOnly"] for m in c["volumeMounts"]) and not c["securityContext"]["privileged"]
    assert c["args"][-2:] == ["--version", "1.31"] and build_job("n", "i")["spec"]["template"]["spec"]["containers"][0]["args"] == BASE_ARGS
    policy = open(os.path.join(os.path.dirname(__file__), "../../k8s/dashboard-admission-policy.yaml")).read()
    for p in HOST_PATHS.values():
        assert f"'{p}'" in policy, f"{p} missing from admission policy"
    assert KUBE_BENCH in policy
    print("kubebench_job demo ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--output")
    ap.add_argument("--version", default="")
    ap.add_argument("--demo", action="store_true")
    a = ap.parse_args()
    if a.demo:
        demo()
    else:
        signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))  # Stop button: unwind so the finally below deletes the Job
        sys.exit(run(a.output, a.version))

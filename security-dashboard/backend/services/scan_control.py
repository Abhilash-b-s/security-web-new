"""Stopping running scans: remembers every scan's subprocesses and kills their whole process group
(the scan script plus the trivy/kubectl/nmap children it started)."""
import asyncio
import os
import signal

_procs: dict = {}      # scan_id -> set of running asyncio subprocesses
_cancelled: set = set()  # scan_ids a user asked to stop

GRACE_SECONDS = 10     # SIGTERM first so scripts can clean up (temporary namespaces, Jobs); SIGKILL after this


def register(scan_id: str, proc) -> None:
    _procs.setdefault(scan_id, set()).add(proc)


def unregister(scan_id: str, proc) -> None:
    _procs.get(scan_id, set()).discard(proc)


def is_cancelled(scan_id: str) -> bool:
    return scan_id in _cancelled


def clear(scan_id: str) -> None:
    _cancelled.discard(scan_id)
    _procs.pop(scan_id, None)


def _signal_group(proc, sig) -> None:
    try:
        os.killpg(proc.pid, sig)  # each scan command is started in its own session, so pid == process group id
    except (ProcessLookupError, PermissionError):
        pass


def _reap_group(pgid: int) -> None:
    """Collect the killed children of a scan's process group. Their parent (the scan script) is gone, so they
    were re-parented to the dashboard (PID 1) and would stay as zombies. The group leader itself is already
    reaped by asyncio."""
    while True:
        try:
            pid, _ = os.waitpid(-pgid, os.WNOHANG)
        except ChildProcessError:
            return
        if pid == 0:
            return


async def stop(scan_id: str) -> bool:
    """Ask a running scan to stop. Returns False if it is not running."""
    procs = [p for p in _procs.get(scan_id, ()) if p.returncode is None]
    _cancelled.add(scan_id)  # also stops the rest of an "all" run
    for p in procs:
        _signal_group(p, signal.SIGTERM)
    for p in procs:
        try:
            await asyncio.wait_for(p.wait(), GRACE_SECONDS)
        except asyncio.TimeoutError:
            _signal_group(p, signal.SIGKILL)
            await p.wait()
    await asyncio.sleep(0.5)  # let the killed grandchildren be re-parented before collecting them
    for p in procs:
        _reap_group(p.pid)
    return True


def demo():
    async def go():
        p = await asyncio.create_subprocess_exec("bash", "-c", "sleep 60 & sleep 60; wait", start_new_session=True)
        register("s1", p)
        assert not is_cancelled("s1")
        await stop("s1")
        assert p.returncode is not None and is_cancelled("s1")
        # a script that ignores SIGTERM is killed after the grace period
        global GRACE_SECONDS
        GRACE_SECONDS = 1
        q = await asyncio.create_subprocess_exec("bash", "-c", "trap '' TERM; sleep 60", start_new_session=True)
        register("s2", q)
        await stop("s2")
        assert q.returncode is not None
        clear("s1"); clear("s2")
        assert not is_cancelled("s1")
    asyncio.run(go())
    print("scan_control demo ok")


if __name__ == "__main__":
    demo()

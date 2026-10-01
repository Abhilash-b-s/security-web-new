"""In-memory per-key sliding-window rate limiter for login brute-force defense."""
import os
import time
from collections import defaultdict

MAX = int(os.getenv("LOGIN_RATE_MAX", "10"))
WINDOW = int(os.getenv("LOGIN_RATE_WINDOW", "300"))

_hits = defaultdict(list)


def limited(key: str, now: float = None) -> bool:
    """Record a hit for key; return True if it now exceeds MAX hits within WINDOW seconds.

    ponytail: in-memory + single-replica only, and the key (client IP) comes from a
    spoofable X-Forwarded-For. Move to Redis + add per-username lockout if the app ever
    scales past one pod or faces distributed brute-force.
    """
    now = time.time() if now is None else now
    hits = [t for t in _hits[key] if now - t < WINDOW]
    hits.append(now)
    _hits[key] = hits
    return len(hits) > MAX


def demo():
    k = "1.2.3.4"
    _hits.clear()
    for i in range(MAX):
        assert limited(k, now=1000) is False, i          # first MAX attempts allowed
    assert limited(k, now=1000) is True                  # MAX+1 within window -> blocked
    assert limited(k, now=1000 + WINDOW + 1) is False    # window slid -> allowed again
    print("ratelimit demo ok")


if __name__ == "__main__":
    demo()

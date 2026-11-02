"""Every GET route the frontend calls must answer 200 at the exact URL it uses (no trailing-slash redirect:
the SPA catch-all would turn it into a 404). Run: STATE_DIR=$(mktemp -d) NEW_DIR=$(mktemp -d) python3 tests/test_routes.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient

import auth
import main

c = TestClient(main.app)
h = {"Authorization": "Bearer " + auth.make_token("superuser", "superuser")}
for url in ("/api/features", "/api/clusters", "/api/schedules", "/api/audit", "/api/compliance", "/api/dashboard/stats",
            "/api/dashboard/history?days=7", "/api/reports/", "/api/suppressions/"):
    r = c.get(url, headers=h, follow_redirects=False)
    assert r.status_code == 200, f"{url} -> {r.status_code}"
print("routes ok")

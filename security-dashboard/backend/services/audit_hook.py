"""Audit helper for routes: works out who and from where, then writes the audit row."""
from fastapi import Request

from auth import decode_token
from services import audit


def client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    return xff.split(",")[0].strip() if xff else (request.client.host if request.client else "?")


def record(request: Request, action: str, target: str = "", detail: str = "", actor: str = None) -> None:
    """Actor defaults to the JWT subject. Never pass secrets in target/detail."""
    if actor is None:
        header = request.headers.get("authorization", "")
        claims = decode_token(header[7:] if header.lower().startswith("bearer ") else None) or {}
        actor = claims.get("sub", "-")
    audit.log_event(actor, action, target, detail, client_ip(request))

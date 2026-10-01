"""JWT auth: env-based credentials, HS256 tokens, role lookup."""
import base64
import hashlib
import hmac
import logging
import os
import secrets
import time

import jwt

logger = logging.getLogger("auth")

AUTH_SECRET = os.getenv("AUTH_SECRET")
if not AUTH_SECRET:
    AUTH_SECRET = secrets.token_hex(32)
    logger.warning("AUTH_SECRET not set; using a random key, tokens invalid after restart")

TOKEN_TTL_SECONDS = 12 * 3600


def verify_password(submitted: str, stored: str) -> bool:
    """Constant-time check. Supports pbkdf2_sha256$<iter>$<salt_b64>$<hash_b64> or plaintext."""
    if not stored:
        return False
    if stored.startswith("pbkdf2_sha256$"):
        try:
            _, iters, salt_b64, hash_b64 = stored.split("$", 3)
            salt = base64.b64decode(salt_b64)
            expected = base64.b64decode(hash_b64)
            got = hashlib.pbkdf2_hmac("sha256", submitted.encode(), salt, int(iters))
        except Exception:
            return False
        return hmac.compare_digest(got, expected)
    return hmac.compare_digest(submitted, stored)


def authenticate(username: str, password: str):
    """Return 'superuser'/'user' if creds match the configured accounts, else None."""
    accounts = {
        "superuser": ("superuser", os.getenv("SUPERUSER_PASSWORD", "")),
        "user": ("user", os.getenv("USER_PASSWORD", "")),
    }
    account = accounts.get(username)
    if account and verify_password(password, account[1]):
        return account[0]
    return None


def make_token(username: str, role: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {"sub": username, "role": role, "iat": now, "exp": now + TOKEN_TTL_SECONDS},
        AUTH_SECRET,
        algorithm="HS256",
    )


def decode_token(token):
    if not token:
        return None
    try:
        return jwt.decode(token, AUTH_SECRET, algorithms=["HS256"])
    except Exception:
        return None


def demo():
    os.environ["SUPERUSER_PASSWORD"] = "sup123"
    assert authenticate("superuser", "sup123") == "superuser"
    assert authenticate("superuser", "wrong") is None
    assert authenticate("nobody", "x") is None
    tok = make_token("superuser", "superuser")
    assert decode_token(tok)["role"] == "superuser"
    assert decode_token(None) is None
    assert decode_token("garbage") is None
    # pbkdf2 round-trip
    salt = b"saltsalt"
    h = hashlib.pbkdf2_hmac("sha256", b"pw", salt, 1000)
    stored = "pbkdf2_sha256$1000$%s$%s" % (
        base64.b64encode(salt).decode(),
        base64.b64encode(h).decode(),
    )
    assert verify_password("pw", stored) is True
    assert verify_password("nope", stored) is False
    assert verify_password("anything", "") is False
    print("auth demo ok")


if __name__ == "__main__":
    demo()

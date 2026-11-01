"""Server feature flags the UI reads after login."""
import os

from fastapi import APIRouter

router = APIRouter()


def terminal_enabled() -> bool:
    """The web terminal is off unless ENABLE_TERMINAL is set (it is an interactive kubectl shell)."""
    return os.getenv("ENABLE_TERMINAL", "false").lower() in ("1", "true", "yes")


@router.get("")
async def get_features():
    return {"terminal": terminal_enabled()}

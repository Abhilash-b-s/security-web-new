from fastapi import APIRouter

from services import findings

router = APIRouter()


@router.get("/findings-age", summary="Open findings by age, plus new and resolved in the last 7 days", tags=["dashboard"])
async def findings_age(cluster: str = "local"):
    return findings.age_summary(cluster)

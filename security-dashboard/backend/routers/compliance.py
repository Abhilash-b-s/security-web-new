from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from services import compliance

router = APIRouter()


def _load(spec_id: str, cluster: str):
    try:
        report = compliance.load_spec(spec_id, cluster)
    except ValueError as e:
        raise HTTPException(status_code=404 if "spec" in str(e) else 400, detail=str(e))
    if report is None:
        raise HTTPException(status_code=404, detail="No report for this spec yet")
    return report


@router.get(
    "",
    summary="List Compliance Reports",
    description="Trivy built-in compliance specs (NSA, Pod Security baseline/restricted) with per-control results. "
                "Specs that have not been scanned are omitted.",
)
async def list_compliance(cluster: str = Query("local")):
    try:
        return {"cluster": cluster, "specs": compliance.load_all(cluster)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{spec_id}.csv", summary="Download Compliance Controls as CSV")
async def compliance_csv(spec_id: str, cluster: str = Query("local")):
    report = _load(spec_id, cluster)
    return Response(compliance.controls_csv(report), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{spec_id}.csv"'})


@router.get("/{spec_id}", summary="Get One Compliance Report")
async def get_compliance(spec_id: str, cluster: str = Query("local")):
    return _load(spec_id, cluster)

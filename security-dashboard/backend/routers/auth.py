from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import auth

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login", tags=["auth"], summary="Log in and get a JWT")
async def login(body: LoginRequest):
    role = auth.authenticate(body.username, body.password)
    if not role:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": auth.make_token(body.username, role), "username": body.username, "role": role}

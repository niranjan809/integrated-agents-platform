import os
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import jwt

router = APIRouter(prefix="/auth", tags=["auth"])

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-please")
JWT_ALGORITHM = "HS256"
TOKEN_TTL_HOURS = 24 * 7  # 7-day sessions

APP_USERNAME = os.getenv("APP_USERNAME", "user")
APP_PASSWORD = os.getenv("APP_PASSWORD", "")


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(data: LoginRequest):
    if not APP_PASSWORD or data.username != APP_USERNAME or data.password != APP_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    payload = {
        "sub": data.username,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {"access_token": token}

from datetime import datetime, timedelta
from typing import Any, Union
from jose import jwt
from passlib.context import CryptContext
from app.core.config import settings
import uuid
import redis.asyncio as redis
import asyncio

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

ALGORITHM = "HS256"

def get_redis_client():
    if not settings.REDIS_URL:
        return None
    return redis.from_url(settings.REDIS_URL, decode_responses=True)

async def set_active_session(user_id: str, session_id: str, expires_seconds: int):
    r = get_redis_client()
    if r:
        await r.set(f"session:{user_id}", session_id, ex=expires_seconds)

async def get_active_session(user_id: str) -> str | None:
    r = get_redis_client()
    if not r:
        return None
    return await r.get(f"session:{user_id}")

async def clear_active_session(user_id: str):
    r = get_redis_client()
    if r:
        await r.delete(f"session:{user_id}")

def create_access_token(subject: Union[str, Any], expires_delta: timedelta = None, session_id: str | None = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"exp": expire, "sub": str(subject)}
    if session_id:
        to_encode["sid"] = session_id
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

from typing import Generator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.core import security
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.all import User
from app.schemas.all import TokenPayload, UserSchema

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

def get_db() -> Generator:
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()

def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme)
) -> User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        username: str = payload.get("sub")
        session_id: str = payload.get("sid")
        if username is None or session_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Oturum doğrulanamadı. Lütfen tekrar giriş yapın.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        token_data = TokenPayload(sub=username)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Oturum doğrulanamadı. Lütfen tekrar giriş yapın.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.email == token_data.sub).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    if user.status == 'disabled':
        raise HTTPException(status_code=400, detail="Kullanıcı hesabı aktif değil.")

    # Single-session: check session_id in Redis
    import asyncio
    active_session = asyncio.run(security.get_active_session(user.id.hex))
    if not active_session or active_session != session_id:
        raise HTTPException(status_code=401, detail="Oturumunuz başka bir cihazdan sonlandırıldı veya geçersiz. Lütfen tekrar giriş yapın.")
    return user

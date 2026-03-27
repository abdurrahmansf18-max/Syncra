from datetime import timedelta
from typing import Any
import uuid
import re
import shutil
import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Response, File, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, DataError
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from app.api import deps
from app.core import security
from app.core.config import settings
from app.models.all import User, Server, ServerMembership, MessageReport, Message, Channel, ChannelType, UserStatus, ServerInvite, Poll
from app.schemas.all import Token, UserCreate, UserSchema, UserUpdate, GoogleAuthRequest
from app.schemas.account_delete import AccountDeleteRequest
from fastapi.security import OAuth2PasswordRequestForm
from app.core.socket_manager import manager

router = APIRouter()
MAX_USERNAME_LENGTH = 15


def _build_unique_username(db: Session, preferred_username: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_]", "", preferred_username).lower()
    if not normalized:
        normalized = "user"
    if len(normalized) < 3:
        normalized = (normalized + "user")[:3]

    base = normalized[:MAX_USERNAME_LENGTH]
    candidate = base
    suffix = 1

    while db.query(User).filter(User.username == candidate).first() is not None:
        suffix_text = str(suffix)
        allowed_base_length = max(1, MAX_USERNAME_LENGTH - len(suffix_text) - 1)
        candidate = f"{base[:allowed_base_length]}_{suffix_text}"
        suffix += 1

    return candidate

@router.put("/me", response_model=UserSchema)
def update_user_me(
    *,
    db: Session = Depends(deps.get_db),
    user_in: UserUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Kullanıcı profilini (Kullanıcı adı, Email, Şifre) güncelle.
    """
    # 1. Kullanıcı adı değişikliği ve Unique kontrolü
    if user_in.username and user_in.username != current_user.username:
        existing_user = db.query(User).filter(User.username == user_in.username).first()
        if existing_user:
             raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten alınmış.")
        current_user.username = user_in.username

    # 2. Email değişikliği ve Unique kontrolü
    if user_in.email and user_in.email != current_user.email:
        existing_email = db.query(User).filter(User.email == user_in.email).first()
        if existing_email:
             raise HTTPException(status_code=400, detail="Bu e-posta adresi zaten kullanımda.")
        current_user.email = user_in.email

    # 3. Şifre değişikliği
    if user_in.password:
        current_user.password_hash = security.get_password_hash(user_in.password)

    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/register", response_model=UserSchema)
def register(
    *,
    db: Session = Depends(deps.get_db),
    user_in: UserCreate,
) -> Any:
    """
    Yeni kullanıcı oluştur. 
    Kullanıcı adı: 3-15 karakter, Unique.
    Şifre: Güçlü politika.
    Email: Zorunlu, Unique.
    """
    # Username Unique Check
    if db.query(User).filter(User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten alınmış.")
    
    # Email Unique Check
    if db.query(User).filter(User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="Bu e-posta adresi zaten kullanımda.")

    # Limit: Max User Count
    if db.query(User).count() >= settings.MAX_USERS:
        raise HTTPException(
            status_code=403, 
            detail=f"Müthiş ilginiz için teşekkürler! Syncra şu an maksimum kapasite olan {settings.MAX_USERS} kişiye ulaştı. Altyapımızı güçlendiriyoruz, çok yakında daha fazla yer açacağız. Lütfen kısa süre sonra tekrar dene!"
        )

    user = User(
        username=user_in.username,
        email=user_in.email,
        password_hash=security.get_password_hash(user_in.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Bu kullanıcı adı veya e-posta zaten kullanımda.")
    except DataError:
        db.rollback()
        raise HTTPException(status_code=422, detail="Kullanıcı bilgileri geçersiz formatta.")
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login_access_token(
    db: Session = Depends(deps.get_db),
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> Any:
    """
    OAuth2 uyumlu token al.
    """
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not security.verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Hatalı kullanıcı adı veya şifre.")
    elif user.status != 'active':
        raise HTTPException(status_code=400, detail="Hesabınız devre dışı.")

    # Single-session: FORCE NEW SESSION (Overwrite old session)
    import asyncio
    session_id = str(uuid.uuid4())
    expires = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    # Overwrite existing session if any
    asyncio.run(security.set_active_session(user.id.hex, session_id, expires))
    
    # Broadcast logout to old sessions
    asyncio.run(manager.force_logout_user(user.id.hex, session_id))

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(
            user.email, expires_delta=access_token_expires, session_id=session_id
        ),
        "token_type": "bearer",
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    current_user: User = Depends(deps.get_current_user),
) -> Response:
    """Aktif oturumu sonlandırır ve Redis'teki session bilgisini temizler."""
    import asyncio

    asyncio.run(security.clear_active_session(current_user.id.hex))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/google", response_model=Token)
def login_with_google(
    *,
    db: Session = Depends(deps.get_db),
    google_auth: GoogleAuthRequest,
) -> Any:
    """
    Geriye dönük uyumluluk endpoint'i.
    mode değerine göre login/register akışına yönlendirir.
    """
    if google_auth.mode == "register":
        return register_with_google(db=db, google_auth=google_auth)
    return login_with_google_only(db=db, google_auth=google_auth)


def _verify_google_identity(id_token_value: str) -> tuple[str, str]:
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="Google girisi su anda yapilandirilmamis.",
        )

    try:
        token_info = id_token.verify_oauth2_token(
            id_token_value,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=5  # 10 saniyelik saat farkina izin ver
        )
    except Exception as e:
        print(f"Google Token Verification Error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Google token dogrulanamadi: {str(e)}")

    email = token_info.get("email")
    email_verified = token_info.get("email_verified")
    given_name = token_info.get("given_name") or token_info.get("name") or ""

    if not email:
        raise HTTPException(status_code=400, detail="Google hesabinda e-posta bulunamadi.")
    if not email_verified:
        raise HTTPException(status_code=400, detail="Google e-posta dogrulanmamis.")

    return email, given_name


def _issue_access_token(email: str) -> dict[str, str]:
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(
            email,
            expires_delta=access_token_expires,
        ),
        "token_type": "bearer",
    }


@router.post("/google/login", response_model=Token)
def login_with_google_only(
    *,
    db: Session = Depends(deps.get_db),
    google_auth: GoogleAuthRequest,
) -> Any:
    """
    Sadece mevcut Google hesabı ile giriş yap.
    """
    email, _ = _verify_google_identity(google_auth.id_token)

    user = db.query(User).filter(User.email == email).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Bu Google hesabı ile kayıt bulunamadı. Önce kayıt olun.",
        )

    if user and user.status != UserStatus.active:
        raise HTTPException(status_code=400, detail="Hesabiniz devre disi.")

    # Force login (Overwrite existing session)
    import asyncio
    session_id = str(uuid.uuid4())
    expires = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    asyncio.run(security.set_active_session(user.id.hex, session_id, expires))
    
    # Broadcast logout to old sessions
    asyncio.run(manager.force_logout_user(user.id.hex, session_id))
    
    return {
        "access_token": security.create_access_token(
            user.email, expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES), session_id=session_id
        ),
        "token_type": "bearer",
    }


@router.post("/google/register", response_model=Token)
def register_with_google(
    *,
    db: Session = Depends(deps.get_db),
    google_auth: GoogleAuthRequest,
) -> Any:
    """
    Sadece yeni Google hesabı oluşturup giriş yap.
    """
    email, given_name = _verify_google_identity(google_auth.id_token)

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user and existing_user.status != UserStatus.active:
        raise HTTPException(status_code=400, detail="Hesabiniz devre disi.")

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="Bu Google hesabı zaten kayıtlı. Google ile giriş yapın.",
        )

    email_prefix = email.split("@")[0]
    preferred_username = given_name or email_prefix
    username = _build_unique_username(db, preferred_username)

    user = User(
        username=username,
        email=email,
        password_hash=security.get_password_hash(uuid.uuid4().hex),
        status=UserStatus.active,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Google hesabı ile kullanıcı oluşturulamadı.")
    except DataError:
        db.rollback()
        raise HTTPException(status_code=422, detail="Google hesabı verileri kaydedilemedi.")
    db.refresh(user)

    # Force login (Overwrite existing session)
    import asyncio
    session_id = str(uuid.uuid4())
    expires = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    asyncio.run(security.set_active_session(user.id.hex, session_id, expires))
    
    # Broadcast logout to old sessions
    asyncio.run(manager.force_logout_user(user.id.hex, session_id))
    
    return {
        "access_token": security.create_access_token(
            user.email, expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES), session_id=session_id
        ),
        "token_type": "bearer",
    }


class ForceLogoutRequest(BaseModel):
    email: str | None = None
    password: str | None = None
    id_token: str | None = None


@router.post("/logout/force", status_code=status.HTTP_204_NO_CONTENT)
def force_logout(
    payload: ForceLogoutRequest,
    db: Session = Depends(deps.get_db),
) -> Response:
    """Oturum kilitlendiğinde, şifre veya Google id_token ile mevcut aktif oturumu sıfırlar."""
    import asyncio

    target_user: User | None = None

    if payload.email and payload.password:
        target_user = db.query(User).filter(User.email == payload.email).first()
        if not target_user:
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
        if not security.verify_password(payload.password, target_user.password_hash):
            raise HTTPException(status_code=400, detail="Şifre hatalı.")
    elif payload.id_token:
        email, _ = _verify_google_identity(payload.id_token)
        target_user = db.query(User).filter(User.email == email).first()
        if not target_user:
            raise HTTPException(status_code=404, detail="Google hesabı ile kullanıcı bulunamadı.")
    else:
        raise HTTPException(status_code=400, detail="email+password veya id_token gereklidir.")

    if target_user.status != UserStatus.active:
        raise HTTPException(status_code=400, detail="Hesap aktif değil.")

    asyncio.run(security.clear_active_session(target_user.id.hex))
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.get("/me", response_model=UserSchema)
def read_users_me(
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Mevcut kullanıcıyı getir.
    """
    return current_user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    *,
    db: Session = Depends(deps.get_db),
    delete_req: AccountDeleteRequest,
    current_user: User = Depends(deps.get_current_user),
    background_tasks: BackgroundTasks,
) -> None:
    """
    Kullanıcı hesabını kalıcı olarak sil.
    
    İşlemler:
    1. Şifre + "onayliyorum" doğrulaması
    2. Sahip olunan sunucular:
         - Üye yoksa → sunucu silinir (cascade ile sunucu/kanal/kategori/mesaj silinir)
         - Üyeler varsa → sahiplik sırasıyla admin > moderator > en eski üyeye devredilir
    3. İlgili açık raporları otomatik çöz
    4. Üye olunan sunucuların şikayetler bölümüne sistem bildirimi ekle
     5. Silinmeyen sunuculardaki mesajları koru (anonim hesaba devret)
     6. Kullanıcıyı sil
    """
    
    # 1. Şifre doğrulama
    if not security.verify_password(delete_req.password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Şifre hatalı.")
    
    # 2. Onay metni kontrolü
    if delete_req.confirmation != "onayliyorum":
        raise HTTPException(status_code=400, detail='Onay için "onayliyorum" yazmalısınız.')
    
    # Single-session: clear session on account delete/logout
    import asyncio
    asyncio.run(security.clear_active_session(current_user.id.hex))
    # 3. Sahip olunan sunucuları al
    owned_servers = db.query(Server).filter(Server.owner_id == current_user.id).all()
    deleted_server_ids: set = set()
    
    for server in owned_servers:
        # Sunucudaki tüm üyelikleri al (owner hariç)
        members = db.query(ServerMembership).filter(
            ServerMembership.server_id == server.id,
            ServerMembership.user_id != current_user.id
        ).all()
        
        if not members:
            # Üye yoksa sunucuyu sil (cascade ile channels, messages vs. silinir)
            db.delete(server)
            deleted_server_ids.add(server.id)
        else:
            # Üyeler var, devir sırası: admin > moderator > en eski uye
            admins = [m for m in members if m.role == "admin"]
            moderators = [m for m in members if m.role == "mod"]
            
            if admins:
                # Admin varsa ilk admine ownership ver
                server.owner_id = admins[0].user_id
            elif moderators:
                # Admin yok, moderator varsa ilk moderatore ownership ver
                server.owner_id = moderators[0].user_id
            else:
                # Admin yoksa en eski üyeyi bul ve admin yap
                oldest_member = min(members, key=lambda m: m.created_at)
                oldest_member.role = "admin"
                server.owner_id = oldest_member.user_id
                db.add(oldest_member)
            
            db.add(server)
    
    # 4. Raporlara bildirim: Kullanıcının ilgili olduğu tüm açık raporları çöz
    # 4a. Kullanıcının şikayet eden olduğu raporlar
    reporter_reports = db.query(MessageReport).filter(
        MessageReport.reporter_id == current_user.id,
        MessageReport.status.in_(["open", "reviewing"])
    ).all()
    
    for report in reporter_reports:
        report.status = "resolved"
        report.resolution_note = f"Şikayet eden kullanıcı ({current_user.username}) hesabını sildi."
        report.reviewed_at = func.now()
        db.add(report)
    
    # 4b. Kullanıcının mesaj yazarı olduğu ve rapor edilen mesajlar
    user_messages = db.query(Message).filter(Message.author_id == current_user.id).all()
    user_message_ids = [msg.id for msg in user_messages]
    
    if user_message_ids:
        author_reports = db.query(MessageReport).filter(
            MessageReport.message_id.in_(user_message_ids),
            MessageReport.status.in_(["open", "reviewing"])
        ).all()
        
        for report in author_reports:
            report.status = "resolved"
            report.resolution_note = f"Mesaj sahibi kullanıcı ({current_user.username}) hesabını sildi."
            report.reviewed_at = func.now()
            db.add(report)
    
    # 5. Uye olunan sunucularin sikayetler bolumune sistem bildirimi ekle
    memberships = db.query(ServerMembership).filter(
        ServerMembership.user_id == current_user.id
    ).all()

    target_server_ids = {
        membership.server_id
        for membership in memberships
        if membership.server_id not in deleted_server_ids
    }

    for server_id in target_server_ids:
        server = db.query(Server).filter(Server.id == server_id).first()
        if not server:
            continue

        channel = db.query(Channel).filter(
            Channel.server_id == server_id,
            Channel.type == ChannelType.text
        ).order_by(Channel.created_at.asc()).first()

        if not channel:
            channel = db.query(Channel).filter(
                Channel.server_id == server_id
            ).order_by(Channel.created_at.asc()).first()

        if not channel:
            continue

        system_text = f"{current_user.username} adlı kullanıcı hesabını sildi."

        system_message = Message(
            server_id=server_id,
            channel_id=channel.id,
            author_id=server.owner_id,
            content=system_text,
        )
        db.add(system_message)
        db.flush()

        system_report = MessageReport(
            server_id=server_id,
            message_id=system_message.id,
            reporter_id=None,
            reason="Sistem bildirimi",
            status="resolved",
            resolution_note=system_text,
            reviewed_by=server.owner_id,
            reviewed_at=func.now(),
        )
        db.add(system_report)

        async def notify_system_report(target_server_id: str, target_report_id: str):
            await manager.broadcast_to_server(
                target_server_id,
                "report_changed",
                {
                    "server_id": target_server_id,
                    "report_id": target_report_id,
                    "status": "resolved",
                },
            )

        db.flush()
        background_tasks.add_task(
            notify_system_report,
            str(server_id),
            str(system_report.id),
        )

    # 6. Silinmeyen sunuculardaki mesajları ve kullanıcı referanslarını koru: anonim kullanıcıya devret
    preserved_messages_query = db.query(Message).filter(Message.author_id == current_user.id)
    if deleted_server_ids:
        preserved_messages_query = preserved_messages_query.filter(
            ~Message.server_id.in_(deleted_server_ids)
        )

    preserved_invites_query = db.query(ServerInvite).filter(ServerInvite.created_by == current_user.id)
    if deleted_server_ids:
        preserved_invites_query = preserved_invites_query.filter(
            ~ServerInvite.server_id.in_(deleted_server_ids)
        )

    preserved_polls_query = db.query(Poll).filter(Poll.created_by == current_user.id)
    if deleted_server_ids:
        preserved_polls_query = preserved_polls_query.filter(
            ~Poll.server_id.in_(deleted_server_ids)
        )

    should_create_shadow_user = any(
        [
            preserved_messages_query.first() is not None,
            preserved_invites_query.first() is not None,
            preserved_polls_query.first() is not None,
        ]
    )

    if should_create_shadow_user:
        shadow_suffix = str(current_user.id).replace("-", "")
        shadow_user = User(
            username=f"deleted-{shadow_suffix[:7]}",
            email=f"deleted-{shadow_suffix}@deleted.example.com",
            password_hash=security.get_password_hash(uuid.uuid4().hex),
            status=UserStatus.disabled,
        )
        db.add(shadow_user)
        db.flush()

        preserved_messages_query.update(
            {Message.author_id: shadow_user.id},
            synchronize_session=False,
        )

        preserved_invites_query.update(
            {ServerInvite.created_by: shadow_user.id},
            synchronize_session=False,
        )

        preserved_polls_query.update(
            {Poll.created_by: shadow_user.id},
            synchronize_session=False,
        )

    # 7. Kullanıcıyı sil (cascade ile server_memberships silinir)
    db.delete(current_user)
    db.commit()


@router.post("/me/avatar", response_model=UserSchema)
def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    # 1. Validate File Size (Max 2MB)
    MAX_FILE_SIZE = 2 * 1024 * 1024
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Dosya boyutu 2MB'dan büyük olamaz.")

    # 2. Validate Content Type
    ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Sadece resim dosyaları yüklenebilir (JPEG, PNG, WEBP, GIF).")

    upload_dir = Path("static/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    # 3. Secure Filename & Extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
         raise HTTPException(status_code=400, detail="Geçersiz dosya uzantısı.")
         
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = upload_dir / unique_filename

    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Dosya yüklenemedi.")

    # Assuming the app is served at root, the URL will be /static/uploads/filename
    # Since we mounted /static to static/
    avatar_url = f"/static/uploads/{unique_filename}"
    
    current_user.avatar_url = avatar_url
    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return current_user

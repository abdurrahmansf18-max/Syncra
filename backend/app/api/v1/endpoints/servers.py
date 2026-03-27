from typing import Any, List
import asyncio
import re
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import String, cast, or_
from sqlalchemy.sql import func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, DataError
from app.core.config import settings
from app.api import deps
from app.models.all import Server, ServerMembership, MemberRole, User, Channel, ChannelType, VoicePresence
from app.schemas.all import ServerCreate, ServerSchema, ServerUpdate ,MembershipSchema
from app.core.socket_manager import manager

router = APIRouter()

MAX_OWNED_SERVERS_PER_USER = settings.MAX_OWNED_SERVERS_PER_USER
MAX_JOINED_SERVERS_PER_USER = settings.MAX_JOINED_SERVERS_PER_USER
MAX_TEXT_CHANNELS_PER_SERVER = settings.MAX_TEXT_CHANNELS_PER_SERVER
MAX_VOICE_CHANNELS_PER_SERVER = settings.MAX_VOICE_CHANNELS_PER_SERVER
MAX_TEXT_CHANNEL_WS_CONNECTIONS = 20
MAX_VOICE_CHANNEL_WS_CONNECTIONS = 10
DEFAULT_TEXT_CHANNEL_NAME = "sohbet"


def _publish_default_general_channel(db: Session, server_id: str) -> None:
    default_channel = (
        db.query(Channel)
        .filter(
            Channel.server_id == server_id,
            Channel.type == ChannelType.text,
            Channel.category_id == None,
            Channel.name.in_([DEFAULT_TEXT_CHANNEL_NAME, "genel-sohbet"]),
        )
        .order_by(Channel.position.asc(), Channel.created_at.asc())
        .first()
    )

    if default_channel and not bool(default_channel.is_published):
        default_channel.is_published = True
        db.add(default_channel)


def _normalize_handle(raw_handle: str) -> str:
    normalized = (raw_handle or "").strip().lower()
    normalized = re.sub(r"[^a-z0-9-]", "-", normalized)
    normalized = re.sub(r"-+", "-", normalized).strip("-")

    if len(normalized) < 3 or len(normalized) > 40:
        raise HTTPException(
            status_code=422,
            detail="Handle en az 3, en fazla 40 karakter olmalıdır.",
        )

    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", normalized):
        raise HTTPException(
            status_code=422,
            detail="Handle sadece küçük harf, rakam ve tire içerebilir.",
        )

    return normalized


def _ensure_unique_owner_name(
    db: Session,
    owner_id: Any,
    name: str,
    exclude_server_id: Any | None = None,
) -> None:
    query = db.query(Server).filter(
        Server.owner_id == owner_id,
        func.lower(Server.name) == name.lower(),
    )
    if exclude_server_id:
        query = query.filter(Server.id != exclude_server_id)

    if query.first():
        raise HTTPException(
            status_code=409,
            detail="Aynı isimde bir sunucunuz zaten var.",
        )

    # Global Server Limit
    owned_count = db.query(Server).filter(Server.owner_id == owner_id).count()
    if owned_count >= MAX_OWNED_SERVERS_PER_USER:
        raise HTTPException(
             status_code=400,
             detail=f"En fazla {MAX_OWNED_SERVERS_PER_USER} sunucu oluşturabilirsiniz.",
        )


def _build_handle_base(name: str) -> str:
    base = re.sub(r"[^a-z0-9-]", "-", name.strip().lower())
    base = re.sub(r"-+", "-", base).strip("-")
    if not base:
        base = "server"
    return base[:30]


def _generate_unique_handle(db: Session, name: str) -> str:
    base = _build_handle_base(name)
    for _ in range(30):
        suffix = uuid.uuid4().hex[:4]
        candidate = f"{base}-{suffix}".strip("-")
        if not db.query(Server).filter(Server.handle == candidate).first():
            return candidate

    fallback = f"server-{uuid.uuid4().hex[:8]}"
    if not db.query(Server).filter(Server.handle == fallback).first():
        return fallback

    raise HTTPException(status_code=500, detail="Sunucu handle üretilemedi.")


def _apply_server_search(query, q: str | None):
    normalized = (q or "").strip()
    if not normalized:
        return query

    search_pattern = f"%{normalized}%"
    return query.filter(
        or_(
            Server.name.ilike(search_pattern),
            Server.handle.ilike(search_pattern),
            cast(Server.id, String).ilike(search_pattern),
        )
    )


def _broadcast_discovery_changed(action: str, server: Server) -> None:
    payload = {
        "action": action,
        "server_id": str(server.id),
        "name": server.name,
        "is_published": bool(server.is_published),
    }

    async def _send() -> None:
        await manager.broadcast_discovery("discovery_changed", payload)

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_send())
    except RuntimeError:
        asyncio.run(_send())


@router.patch("/{server_id}", response_model=ServerSchema)
def update_server(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    server_in: ServerUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Sunucu ayarlarını güncelle (Örn: Yayınlama durumunu değiştir).
    Sadece Sunucu Sahibi veya Admin yapabilir.
    """
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Sunucu bulunamadı")

    # Yetki kontrolü
    # 1. İstek atan kişi üye mi ve yetkili mi?
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()

    if not member or member.role != MemberRole.admin:
         raise HTTPException(status_code=403, detail="Bu işlemi yapmaya yetkiniz yok.")

    # 2. Güncelleme
    was_published = bool(server.is_published)
    previous_name = server.name
    update_data = server_in.model_dump(exclude_unset=True) # Sadece gönderilen alanları al

    if "name" in update_data and update_data["name"]:
        _ensure_unique_owner_name(
            db,
            server.owner_id,
            update_data["name"],
            exclude_server_id=server.id,
        )

    if "handle" in update_data and update_data["handle"] is not None:
        normalized_handle = _normalize_handle(update_data["handle"])
        existing_handle = (
            db.query(Server)
            .filter(Server.handle == normalized_handle, Server.id != server.id)
            .first()
        )
        if existing_handle:
            raise HTTPException(status_code=409, detail="Bu handle zaten kullanılıyor.")
        update_data["handle"] = normalized_handle

    if update_data:
        for field, value in update_data.items():
            setattr(server, field, value)

        if "is_published" in update_data and bool(server.is_published) and not was_published:
            _publish_default_general_channel(db, server_id)
        
        db.add(server)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=409, detail="Sunucu güncellenemedi: benzersizlik kuralı ihlali.")
        except DataError:
            db.rollback()
            raise HTTPException(status_code=422, detail="Sunucu güncelleme verileri geçersiz.")
        db.refresh(server)

        if "is_published" in update_data and was_published != bool(server.is_published):
            _broadcast_discovery_changed(
                "published" if bool(server.is_published) else "unpublished",
                server,
            )
        elif bool(server.is_published) and "name" in update_data and previous_name != server.name:
            _broadcast_discovery_changed("updated", server)

    return server

@router.post("", response_model=ServerSchema, status_code=status.HTTP_201_CREATED)
def create_server(
    *,
    db: Session = Depends(deps.get_db),
    server_in: ServerCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Yeni sunucu oluştur. 
    Otomatik olarak sadece varsayılan bir metin kanalı eklenir.
    Varsayılan olarak 'Taslak' (is_published=False) modundadır.
    """
    # 0. Sunucu limiti: Kullanıcı başına en fazla 5 sahiplik
    owned_count = db.query(Server).filter(Server.owner_id == current_user.id).count()
    if owned_count >= MAX_OWNED_SERVERS_PER_USER:
        raise HTTPException(
            status_code=400,
            detail=f"En fazla {MAX_OWNED_SERVERS_PER_USER} sunucu oluşturabilirsiniz.",
        )

    joined_count = (
        db.query(ServerMembership)
        .filter(
            ServerMembership.user_id == current_user.id,
            ServerMembership.is_banned == False,
        )
        .count()
    )
    if joined_count >= MAX_JOINED_SERVERS_PER_USER:
        raise HTTPException(
            status_code=400,
            detail=f"En fazla {MAX_JOINED_SERVERS_PER_USER} sunucuya katılabilirsiniz.",
        )

    _ensure_unique_owner_name(db, current_user.id, server_in.name)

    if server_in.handle:
        normalized_handle = _normalize_handle(server_in.handle)
        if db.query(Server).filter(Server.handle == normalized_handle).first():
            raise HTTPException(status_code=409, detail="Bu handle zaten kullanılıyor.")
    else:
        normalized_handle = _generate_unique_handle(db, server_in.name)

    # 1. Sunucuyu Oluştur
    server = Server(
        name=server_in.name,
        handle=normalized_handle,
        owner_id=current_user.id,
        is_published=server_in.is_published 
    )
    db.add(server)
    db.flush() # ID almak için flush

    # 2. Kurucuyu Admin Yap
    membership = ServerMembership(
        server_id=server.id,
        user_id=current_user.id,
        role=MemberRole.admin
    )
    db.add(membership)

    # 3. Varsayılan Kanal
    default_channel = Channel(
        server_id=server.id,
        category_id=None,
        name=DEFAULT_TEXT_CHANNEL_NAME,
        type=ChannelType.text,
        position=0,
        min_role_to_view=MemberRole.member,
        min_role_to_post=MemberRole.member,
        is_published=server_in.is_published
    )
    db.add(default_channel)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Sunucu oluşturulamadı: isim veya handle zaten kullanımda.")
    except DataError:
        db.rollback()
        raise HTTPException(status_code=422, detail="Sunucu bilgileri geçersiz formatta.")
    db.refresh(server)

    if bool(server.is_published):
        _broadcast_discovery_changed("published", server)

    return server

@router.get("", response_model=List[ServerSchema])
def read_servers(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    q: str | None = None,
) -> Any:
    """
    Tüm sunucuları listele (Sadece YAYINLANMIŞ olanlar).
    """
    query = db.query(Server).filter(Server.is_published == True)
    query = _apply_server_search(query, q)
    servers = query.offset(skip).limit(limit).all()
    return servers

@router.get("/me", response_model=List[ServerSchema])
def read_my_servers(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    q: str | None = None,
) -> Any:
    """
    Sadece benim üye olduğum sunucuları listele (Giriş zorunlu).
    """
    query = (
        db.query(Server)
        .join(ServerMembership)
        .filter(ServerMembership.user_id == current_user.id)
        .filter(ServerMembership.is_banned == False) # Banlı olduğu sunucuları gösterme
    )
    query = _apply_server_search(query, q)
    servers = query.all()
    return servers


@router.get("/banned", response_model=List[ServerSchema])
def read_banned_servers(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    q: str | None = None,
) -> Any:
    """
    Banlı olduğum sunucuları listele.
    """
    query = (
        db.query(Server)
        .join(ServerMembership)
        .filter(ServerMembership.user_id == current_user.id)
        .filter(ServerMembership.is_banned == True)
    )
    query = _apply_server_search(query, q)
    servers = query.all()
    return servers


@router.get("/limits/me")
def read_my_limit_status(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Kullanıcının global limit durumunu döner.
    """
    owned_count = db.query(Server).filter(Server.owner_id == current_user.id).count()
    joined_count = (
        db.query(ServerMembership)
        .filter(
            ServerMembership.user_id == current_user.id,
            ServerMembership.is_banned == False,
        )
        .count()
    )

    return {
        "limits": {
            "max_owned_servers_per_user": MAX_OWNED_SERVERS_PER_USER,
            "max_joined_servers_per_user": MAX_JOINED_SERVERS_PER_USER,
            "max_text_channels_per_server": MAX_TEXT_CHANNELS_PER_SERVER,
            "max_voice_channels_per_server": MAX_VOICE_CHANNELS_PER_SERVER,
            "max_text_channel_ws_connections": MAX_TEXT_CHANNEL_WS_CONNECTIONS,
            "max_voice_channel_users": MAX_VOICE_CHANNEL_WS_CONNECTIONS,
        },
        "usage": {
            "owned_servers": owned_count,
            "joined_servers": joined_count,
        },
    }


@router.get("/{server_id}/limits/usage")
def read_server_limit_usage(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Sunucu bazlı limit kullanımını döner.
    """
    membership = (
        db.query(ServerMembership)
        .filter(
            ServerMembership.server_id == server_id,
            ServerMembership.user_id == current_user.id,
        )
        .first()
    )

    if not membership:
        raise HTTPException(status_code=403, detail="Bu sunucuya erişim yetkiniz yok.")

    if membership.is_banned:
        reason = (
            f"Bu sunucudan banlandınız. Sebep: {membership.banned_reason}"
            if membership.banned_reason
            else "Bu sunucudan banlandınız."
        )
        raise HTTPException(status_code=403, detail=reason)

    text_channels = (
        db.query(Channel)
        .filter(Channel.server_id == server_id, Channel.type == ChannelType.text)
        .all()
    )
    voice_channels = (
        db.query(Channel)
        .filter(Channel.server_id == server_id, Channel.type == ChannelType.voice)
        .all()
    )

    members_count = (
        db.query(ServerMembership)
        .filter(ServerMembership.server_id == server_id, ServerMembership.is_banned == False)
        .count()
    )

    voice_presence_count = (
        db.query(VoicePresence)
        .filter(VoicePresence.server_id == server_id)
        .count()
    )

    text_channel_ids = {str(channel.id) for channel in text_channels}
    voice_channel_ids = {str(channel.id) for channel in voice_channels}

    active_text_ws_connections = sum(
        len(connections)
        for channel_id, connections in manager.active_connections.items()
        if channel_id in text_channel_ids
    )
    active_voice_ws_connections = sum(
        len(connections)
        for channel_id, connections in manager.active_connections.items()
        if channel_id in voice_channel_ids
    )

    return {
        "limits": {
            "max_text_channels": MAX_TEXT_CHANNELS_PER_SERVER,
            "max_voice_channels": MAX_VOICE_CHANNELS_PER_SERVER,
            "max_text_channel_connections": MAX_TEXT_CHANNEL_WS_CONNECTIONS,
            "max_voice_channel_users": MAX_VOICE_CHANNEL_WS_CONNECTIONS,
        },
        "usage": {
            "text_channels": len(text_channels),
            "voice_channels": len(voice_channels),
            "members": members_count,
            "active_text_ws_connections": active_text_ws_connections,
            "active_voice_ws_connections": active_voice_ws_connections,
            "active_voice_presence": voice_presence_count,
        },
    }


@router.post("/{server_id}/join", response_model=MembershipSchema)
def join_public_server(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Herkese açık sunucuya katıl (Davet kodu olmadan).
    """
    # Sunucu var mı ve yayınlanmış mı?
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Sunucu bulunamadı.")
    
    if not server.is_published:
        raise HTTPException(status_code=403, detail="Bu sunucu herkese açık değil.")

    # Zaten üye mi?
    existing_member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()
    
    if existing_member:
        if existing_member.is_banned:
            reason = f"Bu sunucudan banlandınız. Sebep: {existing_member.banned_reason}" if existing_member.banned_reason else "Bu sunucudan banlandınız."
            raise HTTPException(status_code=403, detail=reason)
        raise HTTPException(status_code=409, detail="Zaten bu sunucunun üyesiniz.")

    joined_count = (
        db.query(ServerMembership)
        .filter(
            ServerMembership.user_id == current_user.id,
            ServerMembership.is_banned == False,
        )
        .count()
    )
    if joined_count >= MAX_JOINED_SERVERS_PER_USER:
        raise HTTPException(
            status_code=400,
            detail=f"En fazla {MAX_JOINED_SERVERS_PER_USER} sunucuya katılabilirsiniz.",
        )

    # Üye ekle
    new_member = ServerMembership(
        server_id=server_id,
        user_id=current_user.id,
        role=MemberRole.member
    )
    db.add(new_member)
    db.commit()
    db.refresh(new_member)
    return new_member


@router.get("/{server_id}", response_model=ServerSchema)
def read_server(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Sunucu detayını getir. (Sadece üyeler görebilir)
    """
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Sunucu bulunamadı")
    
    # Üyelik kontrolü
    member = (
        db.query(ServerMembership)
        .filter(
            ServerMembership.server_id == server_id,
            ServerMembership.user_id == current_user.id
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=403, detail="Bu sunucuya erişim yetkiniz yok. Lütfen önce katılın.")
    
    if member.is_banned:
        reason = f"Bu sunucudan banlandınız. Sebep: {member.banned_reason}" if member.banned_reason else "Bu sunucudan banlandınız."
        raise HTTPException(status_code=403, detail=reason)

    return server


@router.delete("/{server_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_server(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> None:
    """
    Sunucudan ayrıl (Üyeliği iptal et).
    """
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Sunucu bulunamadı.")
    
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()
    
    if not member:
        raise HTTPException(status_code=404, detail="Bu sunucunun üyesi değilsiniz.")
    
    # Sunucu sahibi ayrılamaz (sunucuya başka bir admin yetki ver, sonra ayrıl)
    if member.role == MemberRole.admin and server.owner_id == current_user.id:
        raise HTTPException(status_code=403, detail="Sunucu sahibi ayrılamaz. Başka birine admin yetki ver.")
    
    db.delete(member)
    db.commit()
    return None


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_server(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> None:
    """
    Sunucuyu sil. Sadece Sunucu Sahibi yapabilir.
    """
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Sunucu bulunamadı")

    if str(server.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Bu işlemi sadece sunucu sahibi yapabilir.")

    was_published = bool(server.is_published)
    server_snapshot = {
        "id": str(server.id),
        "name": server.name,
        "is_published": bool(server.is_published),
    }

    # Notify active users in the server about the deletion
    async def _notify_deletion() -> None:
        # Broadcast to all users connected to this server's websocket
        await manager.broadcast_to_server(
            server_id,
            "server_deleted",
            {"server_id": server_id, "name": server_snapshot["name"]}
        )
        
        if was_published:
            await manager.broadcast_discovery(
                "discovery_changed",
                {
                    "action": "deleted",
                    "server_id": server_snapshot["id"],
                    "name": server_snapshot["name"],
                    "is_published": False,
                },
            )

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_notify_deletion())
    except RuntimeError:
        asyncio.run(_notify_deletion())

    db.delete(server)
    db.commit()

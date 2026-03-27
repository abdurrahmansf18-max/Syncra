from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.api import deps
from app.models.all import VoicePresence, Channel, ServerMembership, User, ChannelType
from app.schemas.all import VoiceState, VoiceParticipantSchema
from app.core.config import settings

router = APIRouter()


@router.get("/webrtc/ice-servers")
def get_ice_servers(
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Frontend için WebRTC ICE sunucularını döner.
    TURN bilgileri env ile verilirse response'a eklenir.
    """
    stun_urls = [url.strip() for url in settings.WEBRTC_STUN_URLS.split(",") if url.strip()]
    ice_servers: list[dict[str, Any]] = []

    if stun_urls:
        ice_servers.append({"urls": stun_urls})

    has_turn = (
        settings.WEBRTC_TURN_URL
        and settings.WEBRTC_TURN_USERNAME
        and settings.WEBRTC_TURN_PASSWORD
    )

    if has_turn:
        ice_servers.append(
            {
                "urls": settings.WEBRTC_TURN_URL,
                "username": settings.WEBRTC_TURN_USERNAME,
                "credential": settings.WEBRTC_TURN_PASSWORD,
            }
        )

    return {"ice_servers": ice_servers}

@router.post("/channels/{channel_id}/join", response_model=VoiceState)
def join_voice_channel(
    *,
    db: Session = Depends(deps.get_db),
    channel_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Sesli kanala katıl (Simülasyon). Otomatik olarak eski kanaldan çıkar.
    """
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Kanal bulunamadı.")
        
    if channel.type != ChannelType.voice:
        raise HTTPException(status_code=400, detail="Bu bir ses kanalı değil.")

    # Yetki kontrolü
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == channel.server_id,
        ServerMembership.user_id == current_user.id
    ).first()
    
    if not member or member.is_banned:
        raise HTTPException(status_code=403, detail="Erişim yok.")

    # Mute'lu kullanıcı da ses kanalına girebilir (dinleyebilir).
    # Konuşma kontrolü frontend'de local mic disable ile uygulanır.

    # Zaten bir kanalda mı?
    existing_presence = db.query(VoicePresence).filter(
        VoicePresence.server_id == channel.server_id,
        VoicePresence.user_id == current_user.id
    ).first()
    
    if existing_presence:
        # Aynı kanaldaysa işlem yok
        if str(existing_presence.channel_id) == str(channel_id):
            return existing_presence

        target_channel_count = db.query(VoicePresence).filter(
            VoicePresence.channel_id == channel_id
        ).count()
        if target_channel_count >= 10:
            raise HTTPException(status_code=400, detail="Bu ses kanalında en fazla 10 kullanıcı olabilir.")

        # Farklı kanaldaysa güncelle (Taşı)
        existing_presence.channel_id = channel_id
        db.add(existing_presence)
        db.commit()
        db.refresh(existing_presence)
        return existing_presence

    target_channel_count = db.query(VoicePresence).filter(
        VoicePresence.channel_id == channel_id
    ).count()
    if target_channel_count >= 10:
        raise HTTPException(status_code=400, detail="Bu ses kanalında en fazla 10 kullanıcı olabilir.")

    # Yeni giriş
    vp = VoicePresence(
        server_id=channel.server_id,
        user_id=current_user.id,
        channel_id=channel_id
    )
    db.add(vp)
    try:
        db.commit()
        db.refresh(vp)
        return vp
    except IntegrityError:
        db.rollback()

        concurrent_presence = db.query(VoicePresence).filter(
            VoicePresence.server_id == channel.server_id,
            VoicePresence.user_id == current_user.id,
        ).first()

        if not concurrent_presence:
            raise HTTPException(status_code=500, detail="Ses kanalına katılırken hata oluştu.")

        if str(concurrent_presence.channel_id) != str(channel_id):
            concurrent_presence.channel_id = channel_id
            db.add(concurrent_presence)
            db.commit()
            db.refresh(concurrent_presence)

        return concurrent_presence

@router.post("/channels/{channel_id}/leave")
def leave_voice_channel(
    *,
    db: Session = Depends(deps.get_db),
    channel_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Kanaldan ayrıl.
    """
    vp = db.query(VoicePresence).filter(
        VoicePresence.channel_id == channel_id,
        VoicePresence.user_id == current_user.id
    ).first()
    
    if vp:
        db.delete(vp)
        db.commit()
    return {"message": "Left channel"}

@router.get("/channels/{channel_id}/presence", response_model=List[VoiceParticipantSchema])
def get_channel_presence(
    *,
    db: Session = Depends(deps.get_db),
    channel_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Kanaldaki kullanıcıları listele.
    """
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Kanal bulunamadı.")

    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == channel.server_id,
        ServerMembership.user_id == current_user.id,
    ).first()
    if not member or member.is_banned:
        raise HTTPException(status_code=403, detail="Erişim yok.")

    rows = (
        db.query(User, ServerMembership.mute_until)
        .join(VoicePresence, VoicePresence.user_id == User.id)
        .join(
            ServerMembership,
            (ServerMembership.server_id == channel.server_id)
            & (ServerMembership.user_id == User.id),
        )
        .filter(VoicePresence.channel_id == channel_id)
        .order_by(User.username.asc())
        .all()
    )

    participants: list[VoiceParticipantSchema] = []
    for joined_user, mute_until in rows:
        participants.append(
            VoiceParticipantSchema(
                id=joined_user.id,
                username=joined_user.username,
                email=joined_user.email,
                status=joined_user.status,
                mute_until=mute_until,
            )
        )

    return participants

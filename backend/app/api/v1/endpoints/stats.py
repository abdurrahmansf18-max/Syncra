from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.api import deps
from app.models.all import Message, VoicePresence, ServerMembership, User
from app.schemas.all import StatsSchema

router = APIRouter()

@router.get("/servers/{server_id}/stats", response_model=StatsSchema)
def get_server_stats(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Basit sunucu istatistikleri.
    """
    # Yetki: member görebilir.
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()
    
    if not member or member.is_banned:
        raise HTTPException(status_code=403, detail="Erişim yok.")

    # 1. Toplam mesaj
    total_messages = db.query(func.count(Message.id)).filter(Message.server_id == server_id).scalar()
    
    # 2. Aktif sesli kullanıcı
    # (şimdilik o sunucudaki herhangi bir ses kanalındaki herkes)
    active_voice = db.query(func.count(VoicePresence.id)).filter(VoicePresence.server_id == server_id).scalar()

    # 3. Toplam üye
    total_members = db.query(func.count(ServerMembership.id)).filter(ServerMembership.server_id == server_id).scalar()

    return {
        "total_messages": total_messages or 0,
        "active_voice_users": active_voice or 0,
        "total_members": total_members or 0
    }

from typing import Any, List, Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.config import settings
from app.api import deps
from app.models.all import Message, Channel, ServerMembership, MemberRole, User
from app.schemas.all import MessageCreate, MessageSchema
from app.core.socket_manager import manager

router = APIRouter()
OWN_MESSAGE_DELETE_WINDOW_MINUTES = 120

def get_role_hierarchy(role: str) -> int:
    try:
        return [MemberRole.member, MemberRole.mod, MemberRole.admin].index(role)
    except:
        return 0

@router.post("/channels/{channel_id}/messages", response_model=MessageSchema)
def create_message(
    *,
    db: Session = Depends(deps.get_db),
    channel_id: str,
    message_in: MessageCreate,
    current_user: User = Depends(deps.get_current_user),
    background_tasks: BackgroundTasks,
) -> Any:
    """
    Kanal'a mesaj gönder. Yetkileri kontrol et.
    """
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Kanal bulunamadı.")
    
    # 1. Server'a üye mi?
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == channel.server_id,
        ServerMembership.user_id == current_user.id
    ).first()
    
    if not member:
        raise HTTPException(status_code=403, detail="Bu kanala mesaj atma yetkiniz yok.")
    
    # 2. Banlı mı?
    if member.is_banned:
        raise HTTPException(status_code=403, detail="Banlısınız.")

    # 3. Muted mi?
    if member.mute_until and member.mute_until > datetime.utcnow(): # timezone-naive vs timezone-aware sorunu olabilir, SQLAlchemy utc ile çalışmalı. DDL with timezone.
        raise HTTPException(status_code=403, detail="Sesiniz geçici olarak kapatıldı (Muted).")

    # 4. Role yetiyor mu? (min_role_to_post)
    user_role_idx = get_role_hierarchy(member.role)
    required_idx = get_role_hierarchy(channel.min_role_to_post)
    
    if user_role_idx < required_idx:
        raise HTTPException(status_code=403, detail="Bu kanalda mesaj yetkiniz yok.")
    
    if len(message_in.content) > settings.MAX_MESSAGE_LENGTH:
        raise HTTPException(status_code=400, detail=f"Mesaj uzunluğu sınırı ({settings.MAX_MESSAGE_LENGTH} karakter) aşıldı.")

    message = Message(
        server_id=channel.server_id,
        channel_id=channel_id,
        author_id=current_user.id,
        content=message_in.content
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    message.author = current_user

    # Real-time broadcast to channel listeners
    chat_payload = {
        "id": str(message.id),
        "author_id": str(message.author_id),
        "content": message.content,
        "created_at": message.created_at.isoformat() if message.created_at else datetime.utcnow().isoformat(),
        "is_deleted": message.is_deleted,
        "author": {
            "id": str(current_user.id),
            "username": current_user.username,
            "email": current_user.email,
            "status": str(current_user.status.value) if hasattr(current_user.status, "value") else str(current_user.status),
        },
    }

    background_tasks.add_task(manager.broadcast_text, channel_id, chat_payload)

    return message

@router.get("/channels/{channel_id}/messages", response_model=List[MessageSchema])
def read_messages(
    *,
    db: Session = Depends(deps.get_db),
    channel_id: str,
    before: Optional[str] = None, # pagination
    limit: int = 50,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Mesajları listele. (Soft deleted mesajlar 'Silindi' olarak görülecek)
    """
    # Yetki kontrolü (View permission)
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Kanal bulunamadı.")
        
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == channel.server_id,
        ServerMembership.user_id == current_user.id
    ).first()

    if not member or member.is_banned:
        raise HTTPException(status_code=403, detail="Erişim reddedildi.")

    if get_role_hierarchy(member.role) < get_role_hierarchy(channel.min_role_to_view):
        raise HTTPException(status_code=403, detail="Bu kanalı görüntüleyemezsiniz.")

    query = db.query(Message).filter(Message.channel_id == channel_id)
    if before:
        # Cursor based pagination
        pass 
        # MVP: simple by default, implement if user asks specifically for cursor based details. 
        # For now just limit.
    
    latest_messages = query.order_by(Message.created_at.desc()).limit(limit).all()
    latest_messages.reverse()

    return latest_messages


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_message(
    *,
    db: Session = Depends(deps.get_db),
    message_id: str,
    current_user: User = Depends(deps.get_current_user),
    background_tasks: BackgroundTasks,
) -> None:
    """
    Mesaj silme.
    - Admin/Mod: Herkesin mesajını silebilir (süre sınırı yok).
    - Üye: Sadece kendi mesajını, ilk 2 saat içinde silebilir.
    """
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Mesaj bulunamadı.")

    if message.is_deleted:
        return None

    # Yetki Kontrolü
    can_moderate = False
    
    # Mesajın ait olduğu kanalı ve sunucuyu bul
    channel = db.query(Channel).filter(Channel.id == message.channel_id).first()
    if channel:
        requester_membership = db.query(ServerMembership).filter(
            ServerMembership.server_id == channel.server_id,
            ServerMembership.user_id == current_user.id
        ).first()
        
        if requester_membership and requester_membership.role in [MemberRole.admin, MemberRole.mod]:
            can_moderate = True

    # Kendi mesajı mı?
    is_own_message = str(message.author_id) == str(current_user.id)

    if not (is_own_message or can_moderate):
        raise HTTPException(status_code=403, detail="Bu mesajı silme yetkiniz yok.")

    # Eğer sadece kendi mesajını siliyorsa (ve mod değilse), süre kontrolü yap
    if is_own_message and not can_moderate:
        created_at = message.created_at
        if created_at is None:
            raise HTTPException(status_code=400, detail="Mesaj zamanı doğrulanamadı.")

        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)

        delete_deadline = created_at + timedelta(minutes=OWN_MESSAGE_DELETE_WINDOW_MINUTES)
        if datetime.now(timezone.utc) > delete_deadline:
            raise HTTPException(
                status_code=403,
                detail="Kendi mesajınızı sadece gönderildikten sonraki 2 saat içinde silebilirsiniz.",
            )

    message.is_deleted = True
    message.deleted_by = current_user.id
    message.deleted_at = datetime.now(timezone.utc)
    db.add(message)
    db.commit()

    background_tasks.add_task(
        manager.broadcast,
        str(message.channel_id),
        "message_deleted",
        {"id": str(message.id), "is_deleted": True},
    )

    return None

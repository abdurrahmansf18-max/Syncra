from datetime import datetime, timedelta
from typing import Any
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.core.config import settings
from app.api import deps
from app.models.all import ServerInvite, Server, ServerMembership, MemberRole, User, UserStatus
from app.schemas.all import InviteCreate, InviteSchema, MembershipSchema
from app.core.socket_manager import manager

router = APIRouter()
MAX_JOINED_SERVERS_PER_USER = settings.MAX_JOINED_SERVERS_PER_USER

@router.post("/servers/{server_id}/invites", response_model=InviteSchema)
def create_invite(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    invite_in: InviteCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Sunucu için davet kodu oluştur. Sadece Admin.
    """
    role_rank = {
        MemberRole.admin: 3,
        MemberRole.mod: 2,
        MemberRole.member: 1,
    }

    # Yetki kontrolü
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Sunucu bulunamadı.")

    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()
    
    if not member:
        raise HTTPException(status_code=403, detail="Bu sunucuya erişiminiz yok.")

    min_role = server.invite_min_role or MemberRole.member
    if role_rank.get(member.role, 0) < role_rank.get(min_role, 0):
        raise HTTPException(status_code=403, detail="Davet oluşturma yetkiniz yok.")

    if role_rank.get(invite_in.assigned_role, 0) > role_rank.get(member.role, 0):
        raise HTTPException(status_code=403, detail="Bu rol ile davet oluşturamazsınız.")

    # Unique kod üret (kısa bir uuid parçası)
    code = None
    for _ in range(8):
        candidate = str(uuid.uuid4())[:8]
        exists = db.query(ServerInvite).filter(ServerInvite.code == candidate).first()
        if not exists:
            code = candidate
            break

    if not code:
        raise HTTPException(status_code=500, detail="Davet kodu üretilemedi. Lütfen tekrar deneyin.")
    
    # Expires logic
    expires_at = None
    if invite_in.expires_at:
        expires_at = invite_in.expires_at
    
    invite = ServerInvite(
        server_id=server_id,
        code=code,
        created_by=current_user.id,
        assigned_role=invite_in.assigned_role,
        max_uses=invite_in.max_uses,
        expires_at=expires_at
    )
    db.add(invite)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Davet kodu çakışması oluştu. Lütfen tekrar deneyin.")
    db.refresh(invite)
    return invite

@router.get("/invites/{code}", response_model=InviteSchema)
def read_invite(
    *,
    db: Session = Depends(deps.get_db),
    code: str,
) -> Any:
    """
    Davet kodunu sorgula.
    """
    invite = db.query(ServerInvite).filter(ServerInvite.code == code).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Davet kodu geçersiz.")
    
    if invite.expires_at and invite.expires_at < datetime.utcnow():
        raise HTTPException(status_code=404, detail="Davet kodunun süresi dolmuş.")

    if invite.max_uses and invite.uses_count >= invite.max_uses:
        raise HTTPException(status_code=404, detail="Davet kodu kullanım limitine ulaşmış.")

    server = db.query(Server).filter(Server.id == invite.server_id).first()

    return {
        "code": invite.code,
        "server_id": invite.server_id,
        "server_name": server.name if server else None,
        "assigned_role": invite.assigned_role,
        "uses_count": invite.uses_count,
        "max_uses": invite.max_uses,
        "expires_at": invite.expires_at,
    }

@router.post("/invites/{code}/join", response_model=MembershipSchema)
def join_server(
    *,
    db: Session = Depends(deps.get_db),
    code: str,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Davet kodu ile sunucuya katıl.
    """
    invite = db.query(ServerInvite).filter(ServerInvite.code == code).first()
    # Basic validation
    if not invite:
        raise HTTPException(status_code=404, detail="Davet kodu geçersiz.")
    if invite.expires_at and invite.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Davet süresi dolmuş.")
    if invite.max_uses and invite.uses_count >= invite.max_uses:
        raise HTTPException(status_code=400, detail="Davet limiti dolmuş.")

    # Zaten üye mi?
    existing_member = db.query(ServerMembership).filter(
        ServerMembership.server_id == invite.server_id,
        ServerMembership.user_id == current_user.id
    ).first()
    
    if existing_member:
        if existing_member.is_banned:
            reason = f"Bu sunucudan banlandınız. Sebep: {existing_member.banned_reason}" if existing_member.banned_reason else "Bu sunucudan banlandınız."
            raise HTTPException(status_code=403, detail=reason)
        raise HTTPException(status_code=409, detail="Zaten üyesiniz.")

    # Server Member Limit Check
    server_member_count = db.query(ServerMembership).filter(
        ServerMembership.server_id == invite.server_id,
        ServerMembership.is_banned == False
    ).count()

    if server_member_count >= settings.MAX_MEMBERS_PER_SERVER:
         raise HTTPException(status_code=400, detail=f"Sunucu üye kapasitesi ({settings.MAX_MEMBERS_PER_SERVER} kişi) doldu.")

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

    # Üye yap
    new_member = ServerMembership(
        server_id=invite.server_id,
        user_id=current_user.id,
        role=invite.assigned_role
    )
    db.add(new_member)
    
    # Kullanım sayısını artır
    invite.uses_count += 1
    db.add(invite)
    
    db.commit()
    db.refresh(new_member)
    
    # Broadcast to server members
    manager.broadcast(
        f"syncra:channel:{invite.server_id}",
        "member_joined",
        {
            "server_id": str(invite.server_id),
            "user": {
                "id": str(current_user.id),
                "username": current_user.username,
                "avatar": current_user.avatar,
            },
            "role": new_member.role,
            "joined_at": new_member.joined_at.isoformat() if new_member.joined_at else None,
        }
    )

    return new_member

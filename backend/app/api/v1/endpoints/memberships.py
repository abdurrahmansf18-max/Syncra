from typing import Any, List, Optional
from datetime import datetime
import asyncio
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from app.api import deps
from app.models.all import ServerMembership, Server, MemberRole, User, AuditAction
from app.schemas.all import MembershipSchema, MemberUpdate
from app.core.audit import create_audit_log
from app.core.socket_manager import manager


router = APIRouter()


ROLE_ORDER = {
    MemberRole.member: 1,
    MemberRole.mod: 2,
    MemberRole.admin: 3,
}

@router.get("/servers/{server_id}/members", response_model=List[MembershipSchema])
def read_members(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Sunucu üyelerini listele.
    """
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()
    
    if not member:
        raise HTTPException(status_code=403, detail="Erişim reddedildi.")
    
    if member.is_banned:
        reason = f"Bu sunucudan banlandınız. Sebep: {member.banned_reason}" if member.banned_reason else "Bu sunucudan banlandınız."
        raise HTTPException(status_code=403, detail=reason)

    members = (
        db.query(ServerMembership)
        .filter(
            ServerMembership.server_id == server_id,
            ServerMembership.is_banned == False,
        )
        .limit(limit)
        .all()
    )
    return members


@router.get("/servers/{server_id}/members/banned", response_model=List[MembershipSchema])
def read_banned_members(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Sunucudaki banlanmis uyeleri listele. Sadece Admin.
    """
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id,
    ).first()

    if not member or member.role != MemberRole.admin:
        raise HTTPException(status_code=403, detail="Erişim yetkiniz yok.")

    members = (
        db.query(ServerMembership)
        .filter(
            ServerMembership.server_id == server_id,
            ServerMembership.is_banned == True,
        )
        .limit(limit)
        .all()
    )
    return members


@router.get("/servers/{server_id}/members/{user_id}", response_model=MembershipSchema)
def read_member(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    user_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Belirli bir uyenin bilgilerini getir.
    """
    # 1. Istegi atan uye mi?
    requester = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()
    
    if not requester:
        raise HTTPException(status_code=403, detail="Erişim reddedildi.")
    
    if requester.is_banned:
        raise HTTPException(status_code=403, detail="Banlısınız.")

    # 2. Hedef uyeyi bul
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == user_id
    ).first()

    if not member:
        raise HTTPException(status_code=404, detail="Üye bulunamadı.")
        
    return member

@router.patch("/servers/{server_id}/members/{target_user_id}", response_model=MembershipSchema)
def update_member(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    target_user_id: str,
    member_in: MemberUpdate,
    current_user: User = Depends(deps.get_current_user),
    background_tasks: BackgroundTasks,
) -> Any:
    """
    Üye güncelle (Rol, Ban, Mute).
    - Rol: Sadece Admin
    - Ban/Mute: Admin veya Mod (sadece daha düşük role)
    """
    # 1. Yetki kontrolü (min: mod)
    requester = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()

    if not requester or ROLE_ORDER.get(requester.role, 0) < ROLE_ORDER.get(MemberRole.mod, 0):
        raise HTTPException(status_code=403, detail="Bu işlemi sadece admin veya moderator yapabilir.")

    # 2. Hedef üye var mı?
    target_member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == target_user_id
    ).first()

    if not target_member:
        raise HTTPException(status_code=404, detail="Üye bulunamadı.")
    
    # 3. Kendini güncelleme (örneğin banlama)
    if str(current_user.id) == str(target_user_id):
         if member_in.is_banned:
             raise HTTPException(status_code=400, detail="Kendinizi banlayamazsınız.")
         if member_in.mute_until:
             raise HTTPException(status_code=400, detail="Kendinizi susturamazsınız.")

    # 4. Sunucu Sahibi (Owner) dokunulmazlığı
    server = db.query(Server).filter(Server.id == server_id).first()
    if str(server.owner_id) == str(target_user_id):
        raise HTTPException(status_code=403, detail="Sunucu sahibini düzenleyemezsiniz.")
    
    # 5. Admin Koruma: Bir Admin başka bir Admini atamaz (Sadece Owner yapabilir)
    if target_member.role == MemberRole.admin and str(server.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Yöneticileri sadece sunucu sahibi düzenleyebilir.")

    # 6. Role hiyerarşi kontrolü: isteği atan kişi hedeften yüksek olmalı
    if ROLE_ORDER.get(requester.role, 0) <= ROLE_ORDER.get(target_member.role, 0):
        raise HTTPException(status_code=403, detail="Bu kullanıcı üzerinde işlem yetkiniz yok.")

    update_data = member_in.model_dump(exclude_unset=True)

    role_change_requested = "role" in update_data
    ban_change_requested = "is_banned" in update_data or "banned_reason" in update_data
    mute_change_requested = "mute_until" in update_data or "muted_reason" in update_data

    # 7. Rol sadece admin
    if role_change_requested and requester.role != MemberRole.admin:
        raise HTTPException(status_code=403, detail="Rol işlemi sadece admin yetkisindedir.")

    # 8. Mod, ban/mute yapabilir (sadece member hedefler)
    if requester.role == MemberRole.mod:
        if not (mute_change_requested or ban_change_requested):
            raise HTTPException(status_code=403, detail="Moderator sadece susturma veya ban işlemi yapabilir.")
        if target_member.role != MemberRole.member:
            raise HTTPException(status_code=403, detail="Moderator sadece üyeler üzerinde ban/susturma işlemi yapabilir.")

    # Update logic
    is_updated = False
    action_type = AuditAction.ROLE_CHANGE # default
    was_banned = False

    for field, value in update_data.items():
        if getattr(target_member, field) != value:
            setattr(target_member, field, value)
            is_updated = True
            
            # Audit Action Belirleme
            if field == 'is_banned':
                action_type = AuditAction.BAN if value else AuditAction.UNBAN
                if value:  # Ban edildi
                    was_banned = True
            elif field == 'mute_until':
                action_type = AuditAction.MUTE if value else AuditAction.UNMUTE

    if is_updated:
        # Audit Log Kaydı
        create_audit_log(
            db=db,
            server_id=server_id,
            actor_id=current_user.id,
            action=action_type,
            target_user_id=target_user_id,
            reason=member_in.banned_reason or member_in.muted_reason,
            metadata={"changes": str(update_data)}
        )
        
        # Ban eventi için WebSocket bildirimi
        if was_banned:
            async def notify_ban():
                await manager.broadcast_to_server(
                    server_id,
                    "user_banned",
                    {
                        "user_id": str(target_user_id),
                        "reason": member_in.banned_reason or "Sebep belirtilmedi"
                    }
                )
            background_tasks.add_task(notify_ban)

        async def notify_member_update():
            await manager.broadcast_to_server(
                server_id,
                "member_updated",
                {
                    "user_id": str(target_member.user_id),
                    "role": str(target_member.role.value) if hasattr(target_member.role, "value") else str(target_member.role),
                    "is_banned": target_member.is_banned,
                    "mute_until": target_member.mute_until.isoformat() if target_member.mute_until else None,
                }
            )
        background_tasks.add_task(notify_member_update)

    db.add(target_member)
    db.commit()
    db.refresh(target_member)
    return target_member


@router.delete("/servers/{server_id}/members/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
def kick_member(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    target_user_id: str,
    current_user: User = Depends(deps.get_current_user),
    background_tasks: BackgroundTasks,
) -> None:
    """
    Üyeyi sunucudan at (Kick).
    - Mod: Sadece üyeleri atabilir.
    - Admin: Mod ve üyeleri atabilir.
    """
    # 1. Yetki kontrolü (min: mod)
    requester = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()

    if not requester or ROLE_ORDER.get(requester.role, 0) < ROLE_ORDER.get(MemberRole.mod, 0):
        raise HTTPException(status_code=403, detail="Üye atma yetkiniz yok.")

    # 2. Hedef üye var mı?
    target_member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == target_user_id
    ).first()

    if not target_member:
        raise HTTPException(status_code=404, detail="Üye bulunamadı.")
    
    # 3. Kendini atma
    if str(current_user.id) == str(target_user_id):
        # Kendini atmak yerine "Sunucudan ayril" (Leave Server) endpointi kullanilmali
        raise HTTPException(status_code=400, detail="Kendinizi atamazsınız.")

    # 4. Sunucu Sahibi (Owner) dokunulmazlığı
    server = db.query(Server).filter(Server.id == server_id).first()
    if str(server.owner_id) == str(target_user_id):
        raise HTTPException(status_code=403, detail="Sunucu sahibini atamazsınız.")
    
    # 5. Role hiyerarşi kontrolü: isteği atan kişi hedeften yüksek olmalı
    requester_rank = ROLE_ORDER.get(requester.role, 0)
    target_rank = ROLE_ORDER.get(target_member.role, 0)

    if requester_rank <= target_rank:
        raise HTTPException(status_code=403, detail="Sizden yüksek veya eşit yetkideki birini atamazsınız.")
    
    # Kick işlemi (Delete from membership)
    db.delete(target_member)
    
    # Audit Log
    create_audit_log(
        db=db,
        server_id=server_id,
        actor_id=current_user.id,
        action=AuditAction.ROLE_CHANGE, # Keeping as ROLE_CHANGE to avoid DB enum migration issues for now
        target_user_id=target_user_id,
        reason="Kicked by moderator/admin",
        metadata={"action": "kick"}
    )
    
    db.commit()

    async def notify_kick():
        await manager.broadcast_to_server(
            server_id,
            "member_kicked",
            {"user_id": str(target_user_id)}
        )
    background_tasks.add_task(notify_kick)


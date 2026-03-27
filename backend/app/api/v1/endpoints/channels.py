from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.config import settings
from app.api import deps
from app.models.all import Channel, ServerMembership, MemberRole, User, Category, ChannelType
from app.schemas.all import ChannelCreate, ChannelSchema, ChannelUpdate, ChannelPublishUpdate, CategoryCreate, CategoryUpdate, CategorySchema
from app.core.socket_manager import manager
import json
 
router = APIRouter()

MAX_TEXT_CHANNELS_PER_SERVER = settings.MAX_TEXT_CHANNELS_PER_SERVER
MAX_VOICE_CHANNELS_PER_SERVER = settings.MAX_VOICE_CHANNELS_PER_SERVER
 
def get_user_role_index(role: str) -> int:
    roles = [MemberRole.member, MemberRole.mod, MemberRole.admin]
    try:
        return roles.index(role)
    except ValueError:
        return 0
 
 
@router.post("/servers/{server_id}/categories", response_model=CategorySchema)
def create_category(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    category_in: CategoryCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Kategori oluştur. Sadece Admin.
    """
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()
 
    if not member or member.role != MemberRole.admin:
        raise HTTPException(status_code=403, detail="Sadece yöneticiler kategori oluşturabilir.")
 
    category = Category(
        server_id=server_id,
        name=category_in.name,
        position=category_in.position,
        is_published=category_in.is_published,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    
    # Broadcast to server
    manager.broadcast(
        f"syncra:channel:{server_id}",
        "category_created",
        {"id": category.id, "name": category.name, "server_id": server_id}
    )

    return category
 
 
@router.patch("/servers/{server_id}/categories/{category_id}", response_model=CategorySchema)
def update_category(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    category_id: str,
    category_in: CategoryUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Kategori düzenle. Sadece Admin.
    """
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()
 
    if not member or member.role != MemberRole.admin:
        raise HTTPException(status_code=403, detail="Sadece yöneticiler kategori düzenleyebilir.")
 
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.server_id == server_id,
    ).first()
 
    if not category:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı.")
 
    update_data = category_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(category, field, value)
 
    db.add(category)
    db.commit()
    db.refresh(category)
    return category
 
 
@router.delete("/servers/{server_id}/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    category_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> None:
    """
    Kategori sil. Sadece Admin.
    Kategoriye bağlı kanallar silinmez; kategorisiz (category_id=None) olur.
    """
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()
 
    if not member or member.role != MemberRole.admin:
        raise HTTPException(status_code=403, detail="Sadece yöneticiler kategori silebilir.")
 
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.server_id == server_id,
    ).first()
 
    if not category:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı.")
 
    linked_channels = db.query(Channel).filter(
        Channel.server_id == server_id,
        Channel.category_id == category_id,
    ).all()
 
    for channel in linked_channels:
        channel.category_id = None
        db.add(channel)
    
    db.delete(category)
    db.commit()

    manager.broadcast(
        f"syncra:channel:{server_id}",
        "category_deleted",
        {"id": category_id, "server_id": server_id}
    )
    return None
 
 
@router.get("/servers/{server_id}/categories", response_model=List[CategorySchema])
def read_categories(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Sunucu kategorilerini listele.
    """
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()
 
    if not member:
        raise HTTPException(status_code=403, detail="Bu sunucuya erişim yetkiniz yok")
 
    if member.is_banned:
        reason = f"Bu sunucudan banlandınız. Sebep: {member.banned_reason}" if member.banned_reason else "Bu sunucudan banlandınız."
        raise HTTPException(status_code=403, detail=reason)
 
    query = db.query(Category).filter(Category.server_id == server_id)
    if member.role != MemberRole.admin:
        query = query.filter(Category.is_published == True)
 
    return query.order_by(Category.position.asc(), Category.created_at.asc()).all()
 
@router.patch("/servers/{server_id}/channels/{channel_id}", response_model=ChannelSchema)
async def update_channel(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    channel_id: str,
    channel_in: ChannelUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Kanalı güncelle. (Sadece Admin)
    Anlık bildirim (WebSocket) gönderir.
    """
    # 1. Yetki Kontrolü
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()
   
    if not member or member.role != MemberRole.admin:
        raise HTTPException(status_code=403, detail="Sadece yöneticiler kanalı düzenleyebilir.")
 
    # 2. Kanalı Bul
    channel = db.query(Channel).filter(Channel.id == channel_id, Channel.server_id == server_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Kanal bulunamadı.")
 
    # 3. Güncelle
    update_data = channel_in.model_dump(exclude_unset=True)
    if update_data:
        for field, value in update_data.items():
            setattr(channel, field, value)
       
        db.add(channel)
        db.commit()
        db.refresh(channel)
 
        # 4. Canlı Bildirim (Real-time Broadcast)
        # Kanalın özelliklerinin değiştiğini o kanaldaki herkese duyur
        # NOT: Asıl kanal ID'sine bağlı olanlara haber veriyoruz.
        # Eğer kanal adı değiştiyse, arayüzde anında değişmeli.
       
        await manager.broadcast(
            channel_id=f"syncra:channel:{server_id}", # Broadcast to SERVER, not just channel members
            message_type="channel_updated",
            data={
                "id": str(channel.id),
                "name": channel.name,
                "server_id": str(server_id),
                "type": channel.type,
                "category_id": channel.category_id,
                "updates": json.loads(channel_in.model_dump_json(exclude_unset=True)) # UUID serialization için
            }
        )
 
    return channel
 
 
@router.patch("/servers/{server_id}/channels/{channel_id}/publish", response_model=ChannelSchema)
def publish_channel(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    channel_id: str,
    publish_in: ChannelPublishUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Kanalın yayın durumunu değiştir. (Sadece Admin)
    """
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id,
    ).first()
 
    if not member or member.role != MemberRole.admin:
        raise HTTPException(status_code=403, detail="Sadece yöneticiler kanal yayın durumunu değiştirebilir.")
 
    channel = db.query(Channel).filter(
        Channel.id == channel_id,
        Channel.server_id == server_id,
    ).first()
 
    if not channel:
        raise HTTPException(status_code=404, detail="Kanal bulunamadı.")
 
    channel.is_published = publish_in.is_published
    db.add(channel)
    db.commit()
    db.refresh(channel)
    return channel
 
 
@router.delete("/servers/{server_id}/channels/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_channel(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    channel_id: str,
    current_user: User = Depends(deps.get_current_user),
) -> None:
    """
    Kanal sil. Sadece Admin.
    """
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id,
    ).first()
 
    if not member or member.role != MemberRole.admin:
        raise HTTPException(status_code=403, detail="Sadece yöneticiler kanal silebilir.")
 
    channel = db.query(Channel).filter(
        Channel.id == channel_id,
        Channel.server_id == server_id,
    ).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Kanal bulunamadı.")
 
    db.delete(channel)
    db.commit()

    manager.broadcast(
        f"syncra:channel:{server_id}",
        "channel_deleted",
        {"id": channel_id, "server_id": server_id}
    )
    return None
 
 
@router.post("/servers/{server_id}/channels", response_model=ChannelSchema)
def create_channel(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    channel_in: ChannelCreate,
    current_user: User = Depends(deps.get_current_user),
    background_tasks: BackgroundTasks,
) -> Any:
    """
    Kanal oluştur. Sadece Admin.
    """
    # Yetki kontrolü
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()
   
    if not member or member.role != MemberRole.admin:
        raise HTTPException(status_code=403, detail="Sadece yöneticiler kanal oluşturabilir.")
 
    if channel_in.category_id:
        category = db.query(Category).filter(
            Category.id == channel_in.category_id,
            Category.server_id == server_id,
        ).first()
        if not category:
            raise HTTPException(status_code=404, detail="Kategori bulunamadı veya bu sunucuya ait değil.")
 
    # Kanal limiti kontrolü: Metin max 10, Ses max 5
    text_count = db.query(Channel).filter(
        Channel.server_id == server_id,
        Channel.type == ChannelType.text,
    ).count()
    voice_count = db.query(Channel).filter(
        Channel.server_id == server_id,
        Channel.type == ChannelType.voice,
    ).count()

    if channel_in.type == ChannelType.text and text_count >= MAX_TEXT_CHANNELS_PER_SERVER:
        raise HTTPException(
            status_code=400,
            detail=f"En fazla {MAX_TEXT_CHANNELS_PER_SERVER} metin kanalı oluşturabilirsiniz.",
        )

    if channel_in.type == ChannelType.voice:
        if voice_count >= MAX_VOICE_CHANNELS_PER_SERVER:
            raise HTTPException(
                status_code=400,
                detail=f"En fazla {MAX_VOICE_CHANNELS_PER_SERVER} sesli kanal oluşturabilirsiniz.",
            )
 
    channel = Channel(
        server_id=server_id,
        category_id=channel_in.category_id,
        name=channel_in.name,
        type=channel_in.type,
        min_role_to_view=channel_in.min_role_to_view,
        min_role_to_post=channel_in.min_role_to_post,
        is_published=channel_in.is_published
    )
    db.add(channel)
    db.commit()
    db.refresh(channel)

    background_tasks.add_task(
        manager.broadcast,
        f"syncra:channel:{server_id}",
        "channel_created",
        {
            "id": str(channel.id),
            "name": channel.name,
            "type": channel.type,
            "server_id": str(server_id),
            "category_id": channel.category_id,
        },
    )

    return channel
 
@router.get("/servers/{server_id}/channels", response_model=List[ChannelSchema])
def read_channels(
    *,
    db: Session = Depends(deps.get_db),
    server_id: str,
    search: Optional[str] = None,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Sunucu kanallarını listele. (Rolüne uygun olanları döner)
    """
    # Üyelik ve rol kontrolü
    member = db.query(ServerMembership).filter(
        ServerMembership.server_id == server_id,
        ServerMembership.user_id == current_user.id
    ).first()
 
    if not member:
        raise HTTPException(status_code=403, detail="Bu sunucuya erişim yetkiniz yok")
   
    if member.is_banned:
        reason = f"Bu sunucudan banlandınız. Sebep: {member.banned_reason}" if member.banned_reason else "Bu sunucudan banlandınız."
        raise HTTPException(status_code=403, detail=reason)
 
    user_role_index = get_user_role_index(member.role)
 
    query = db.query(Channel).filter(Channel.server_id == server_id)
 
    # TASLAK FİLTRESİ
    # Eğer Admin değilse, sadece yayınlanmış kanalları görebilir.
    if member.role != MemberRole.admin:
        query = query.filter(Channel.is_published == True)
   
    # Arama Filtresi
    if search:
        query = query.filter(Channel.name.ilike(f"%{search}%"))
       
    all_channels = query.all()
    visible_channels = []
   
    for ch in all_channels:
        required_role_index = get_user_role_index(ch.min_role_to_view)
        if user_role_index >= required_role_index:
            visible_channels.append(ch)
 
    return visible_channels
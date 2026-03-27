from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.core import security
from app.models.all import User, Channel, ChannelType, ServerMembership
from app.core.socket_manager import manager
from jose import jwt, JWTError
from app.core.config import settings
from sqlalchemy.sql import func
from sqlalchemy.orm.exc import StaleDataError
import json
from uuid import UUID

router = APIRouter()

MAX_TEXT_CHANNEL_WS_CONNECTIONS = 20
MAX_VOICE_CHANNEL_WS_CONNECTIONS = 10


def _load_membership(db: Session, server_id: str, user_id: str) -> ServerMembership | None:
    return (
        db.query(ServerMembership)
        .filter(
            ServerMembership.server_id == server_id,
            ServerMembership.user_id == user_id,
        )
        .first()
    )


def _set_online(db: Session, server_id: str, user_id: str) -> ServerMembership | None:
    membership = _load_membership(db, server_id, user_id)
    if not membership:
        return None

    membership.is_online = True
    db.add(membership)
    try:
        db.commit()
        db.refresh(membership)
        return membership
    except StaleDataError:
        db.rollback()
        return None


def _set_offline(db: Session, server_id: str, user_id: str) -> ServerMembership | None:
    membership = _load_membership(db, server_id, user_id)
    if not membership:
        return None

    if not membership.is_online:
        return membership

    membership.is_online = False
    membership.last_seen_at = func.now()
    db.add(membership)
    try:
        db.commit()
        db.refresh(membership)
        return membership
    except StaleDataError:
        db.rollback()
        return None

async def get_user_from_token_with_sid(token: str, db: Session) -> tuple[User | None, str | None]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[security.ALGORITHM])
        email: str = payload.get("sub")
        sid: str = payload.get("sid")
        if email is None or sid is None:
            return None, None
    except JWTError:
        return None, None

    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None, None
    if user.status != 'active':
        return None, None

    active_session = await security.get_active_session(user.id.hex)
    if not active_session or active_session != sid:
        return None, None
    return user, sid

@router.websocket("/ws/channel/{channel_id}")
async def websocket_endpoint(websocket: WebSocket, channel_id: str, token: str, db: Session = Depends(deps.get_db)):
    """
    WebSocket Endpoint: Canlı Sohbet + WebRTC Signaling
    """
    # 1. Auth Check (Token Validate)
    user, session_id = await get_user_from_token_with_sid(token, db)
    if not user:
        await websocket.close(code=4003) # Unauthorized Close Code
        return
    
    # Store session_id on websocket object for later comparison
    websocket.session_id = session_id

    # 2. Kanal ID doğrulama
    try:
        parsed_channel_id = UUID(channel_id)
    except ValueError:
        await websocket.close(code=4400, reason="Gecersiz kanal kimligi.")
        return

    # 3. Kanal Limit Kontrolü (Sadece Voice kanalları için Max 8)
    # Performans Notu: Her bağlantıda DB sorgusu yapar.
    channel = db.query(Channel).filter(Channel.id == parsed_channel_id).first()
    if not channel:
        await websocket.close(code=4404, reason="Kanal bulunamadı.")
        return

    membership = (
        db.query(ServerMembership)
        .filter(
            ServerMembership.server_id == channel.server_id,
            ServerMembership.user_id == user.id,
        )
        .first()
    )

    if not membership or membership.is_banned:
        await websocket.close(code=4003, reason="Erişim yok.")
        return

    # Kanal tipi bazlı websocket bağlantı limiti
    if manager.redis_enabled:
        current_connections_count = await manager.get_channel_connection_count(channel_id)
    else:
        current_connections_count = len(manager.active_connections.get(channel_id, []))

    if channel and channel.type == ChannelType.voice:
        if current_connections_count >= MAX_VOICE_CHANNEL_WS_CONNECTIONS:
            await websocket.close(
                code=4003,
                reason=f"Kanal dolu (Max {MAX_VOICE_CHANNEL_WS_CONNECTIONS} kişi).",
            )
            return
    elif channel and channel.type == ChannelType.text:
        if current_connections_count >= MAX_TEXT_CHANNEL_WS_CONNECTIONS:
            await websocket.close(
                code=4003,
                reason=f"Kanal dolu (Max {MAX_TEXT_CHANNEL_WS_CONNECTIONS} kişi).",
            )
            return

    # 3.5. WebSocket bağlantısını kabul et ve manager'a ekle
    try:
        await manager.connect(
            websocket,
            channel_id,
            server_id=str(channel.server_id),
            user_id=str(user.id),
        )
        await manager.connect_user(websocket, str(user.id))  # Register for force logout
        if manager.redis_enabled:
            await manager.mark_channel_connection_open(channel_id)
            await manager.mark_user_server_connection_open(
                str(channel.server_id),
                str(user.id),
            )
    except Exception as e:
        print(f"❌ WebSocket connect hatası: {e}")
        # Note: manager.connect fails if accept fails. 
        # If connect succeeds, connection is open.
        # If connect fails, we should ensure close.
        return

    # 4. User online yap
    online_membership = _set_online(db, str(channel.server_id), str(user.id))
    
    # Diğer clientlere broadcast et (user online oldu)
    await manager.broadcast_to_server(
        channel.server_id,
        "user_online_status_changed",
        {
            "user_id": str(user.id),
            "username": user.username,
            "is_online": True,
            "last_seen_at": online_membership.last_seen_at.isoformat() if online_membership and online_membership.last_seen_at else None
        }
    )

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break

            data = message.get("text")
            if not data:
                continue

            try:
                message_data = json.loads(data)
            except Exception:
                continue
            
            # --- Mesaj Tipleri ---
            
            # TİP A: Mesaj Gönderimi (Text Chat)
            # Hem Text hem Voice kanallarına mesaj atılabilir (Hibrit Model)
            if message_data.get("type") == "message":
                chat_content = {
                    "user_id": str(user.id),
                    "username": user.username,
                    "content": message_data.get("content"),
                    "channel_id": channel_id
                }
                await manager.broadcast_text(channel_id, chat_content)

            # TİP B: WebRTC Signaling (Voice Chat)
            elif message_data.get("type") in ["offer", "answer", "candidate"]:
                # Gönderen hariç diğerlerine ilet
                signal_payload = {
                    "sender_id": str(user.id),
                    "signal_type": message_data.get("type"),
                    "payload": message_data.get("payload")
                }
                await manager.broadcast_signal(channel_id, websocket, signal_payload)

            # TİP C: Typing indicator (Text Chat)
            elif message_data.get("type") == "typing":
                await manager.broadcast(
                    channel_id,
                    "typing",
                    {
                        "user_id": str(user.id),
                        "username": user.username,
                        "is_typing": bool(message_data.get("is_typing")),
                    },
                )

            # TİP D: Keepalive ping
            elif message_data.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong", "data": {"ok": True}}))

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, channel_id)
        manager.disconnect_user(websocket, str(user.id)) # Unregister user socket

        if manager.redis_enabled:
            await manager.mark_channel_connection_closed(channel_id)
            await manager.mark_user_server_connection_closed(
                str(channel.server_id),
                str(user.id),
            )
            still_connected = await manager.has_active_server_connection(
                str(channel.server_id),
                str(user.id),
            )
        else:
            still_connected = manager.has_active_channel_connection_for_user(
                str(channel.server_id),
                str(user.id),
            )

        if still_connected:
            return

        offline_membership = _set_offline(db, str(channel.server_id), str(user.id))
        if offline_membership:
            await manager.broadcast_to_server(
                channel.server_id,
                "user_online_status_changed",
                {
                    "user_id": str(user.id),
                    "username": user.username,
                    "is_online": False,
                    "last_seen_at": offline_membership.last_seen_at.isoformat() if offline_membership.last_seen_at else None
                }
            )

@router.websocket("/ws/server/{server_id}")
async def server_websocket_endpoint(websocket: WebSocket, server_id: str, token: str, db: Session = Depends(deps.get_db)):
    """...{token[-6:] if len(token)>6 else '***'}
    WebSocket Endpoint: Server-wide events (ban, kick, online status, etc.)
    """
    safe_token = f"...{token[-6:]}" if len(token) > 6 else "***"
    print(f"🔌 WebSocket bağlantı denemesi - Server: {server_id}, Token: {safe_token}")
    
    # Auth Check
    user, session_id = await get_user_from_token_with_sid(token, db)
    if not user:
        print(f"❌ Token validation başarısız for token ending: ...{token[-6:] if len(token)>6 else '***'}")
        await websocket.close(code=4003)
        return
    
    websocket.session_id = session_id
    
    print(f"✅ User doğrulandi: {user.username}")

    # Get membership
    membership = (
        db.query(ServerMembership)
        .filter(
            ServerMembership.server_id == server_id,
            ServerMembership.user_id == user.id,
        )
        .first()
    )
    
    if not membership:
        print(f"❌ Membership bulunamadı - User: {user.id}, Server: {server_id}")
        await websocket.close(code=4003)
        return
    
    print(f"✅ Membership bulundu: {membership.user_id}")

    # Connect to server
    try:
        # Connect Manager handles accepting the connection within connect_server
        # Removing duplicate manager.connect call which also accepts
        # await manager.connect(websocket, channel_id=None, server_id=server_id, user_id=str(user.id))
        
        await manager.connect_server(websocket, server_id)
        await manager.connect_user(websocket, str(user.id)) # Register for logout
        
        if manager.redis_enabled:
            await manager.mark_user_server_connection_open(server_id, str(user.id))
        print(f"✅ WebSocket accepted")
    except Exception as e:
        print(f"❌ WebSocket accept hatası: {e}")
        return
    
    # User online yap
    online_membership = _set_online(db, server_id, str(user.id))
    if online_membership:
        print(f"✅ User online set: {user.username}")
    
    # Diğer clientlere broadcast et
    await manager.broadcast_to_server(
        server_id,
        "user_online_status_changed",
        {
            "user_id": str(user.id),
            "username": user.username,
            "is_online": True,
            "last_seen_at": online_membership.last_seen_at.isoformat() if online_membership and online_membership.last_seen_at else None
        }
    )

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect_server(websocket, server_id)
        manager.disconnect_user(websocket, str(user.id)) # Unregister

        if manager.redis_enabled:
            await manager.mark_user_server_connection_closed(server_id, str(user.id))
            still_connected = await manager.has_active_server_connection(server_id, str(user.id))
        else:
            still_connected = manager.has_active_channel_connection_for_user(server_id, str(user.id))

        if still_connected:
            return

        offline_membership = _set_offline(db, server_id, str(user.id))
        if offline_membership:
            await manager.broadcast_to_server(
                server_id,
                "user_online_status_changed",
                {
                    "user_id": str(user.id),
                    "username": user.username,
                    "is_online": False,
                    "last_seen_at": offline_membership.last_seen_at.isoformat() if offline_membership.last_seen_at else None
                }
            )

@router.websocket("/ws/discovery")
async def discovery_websocket_endpoint(
    websocket: WebSocket,
    token: str,
    db: Session = Depends(deps.get_db),
):
    """
    WebSocket Endpoint: global discover page events
    """
    user, session_id = await get_user_from_token_with_sid(token, db)
    if not user:
        await websocket.close(code=4003)
        return
        
    websocket.session_id = session_id

    try:
        await manager.connect_discovery(websocket)
        await manager.connect_user(websocket, str(user.id))
    except Exception:
        return

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect_discovery(websocket)
        if user:
            manager.disconnect_user(websocket, str(user.id))
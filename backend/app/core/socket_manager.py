import asyncio
import json
import uuid
from typing import Any, Dict, List, Tuple

from fastapi import WebSocket
from redis import asyncio as redis

from app.core.config import settings

class ConnectionManager:
    def __init__(self):
        self.instance_id = uuid.uuid4().hex
        # channel_id -> List[WebSocket]
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # websocket_id -> (server_id, user_id)
        self.channel_connection_context: Dict[int, Tuple[str, str]] = {}
        # (server_id, user_id) -> active socket count
        self.user_server_connection_counts: Dict[Tuple[str, str], int] = {}
        # server_id -> List[WebSocket] (for server-wide events)
        self.server_connections: Dict[str, List[WebSocket]] = {}
        # global discovery listeners
        self.discovery_connections: List[WebSocket] = []
        # user_id -> List[WebSocket] (for user session management)
        self.user_connections: Dict[str, List[WebSocket]] = {}

        # Redis Pub/Sub (optional)
        self.redis_url = settings.REDIS_URL
        self._redis: redis.Redis | None = None
        self._pubsub: redis.client.PubSub | None = None
        self._pubsub_task: asyncio.Task | None = None
        self._redis_enabled = False

    @property
    def redis_enabled(self) -> bool:
        return self._redis_enabled

    async def startup(self) -> None:
        if not self.redis_url:
            return

        try:
            self._redis = redis.from_url(self.redis_url, decode_responses=True)
            await self._redis.ping()
            self._pubsub = self._redis.pubsub()
            await self._pubsub.psubscribe(
                "syncra:channel:*",
                "syncra:server:*",
                "syncra:discovery",
                "syncra:user_logout:*"
            )
            self._pubsub_task = asyncio.create_task(self._pubsub_loop())
            self._redis_enabled = True
            print("[INFO] Redis Pub/Sub aktif.")
        except Exception as exc:
            print(f"[WARN] Redis başlatılamadı, local moda dönülüyor: {exc}")
            self._redis_enabled = False
            if self._pubsub:
                await self._pubsub.close()
                self._pubsub = None
            if self._redis:
                await self._redis.close()
                self._redis = None

    async def shutdown(self) -> None:
        if self._pubsub_task:
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except asyncio.CancelledError:
                pass
            self._pubsub_task = None

        if self._pubsub:
            await self._pubsub.close()
            self._pubsub = None

        if self._redis:
            await self._redis.close()
            self._redis = None

        self._redis_enabled = False

    async def _pubsub_loop(self) -> None:
        if not self._pubsub:
            return

        try:
            while True:
                message = await self._pubsub.get_message(
                    ignore_subscribe_messages=True,
                    timeout=1.0,
                )
                if not message:
                    await asyncio.sleep(0.01)
                    continue

                raw_channel = message.get("channel")
                raw_data = message.get("data")
                if not raw_channel or not raw_data:
                    continue

                channel_name = (
                    raw_channel.decode("utf-8")
                    if isinstance(raw_channel, bytes)
                    else str(raw_channel)
                )
                payload_text = (
                    raw_data.decode("utf-8")
                    if isinstance(raw_data, bytes)
                    else str(raw_data)
                )

                try:
                    payload = json.loads(payload_text)
                except Exception:
                    continue
                
                if channel_name.startswith("syncra:user_logout:"):
                    user_id = channel_name.removeprefix("syncra:user_logout:")
                    new_sess = payload.get("new_session_id")
                    if user_id in self.user_connections:
                        for ws in list(self.user_connections[user_id]):
                            if getattr(ws, "session_id", None) != new_sess:
                                try:
                                    await ws.close(code=4001, reason="NewLogin")
                                except:
                                    pass
                    continue

                await self._handle_pubsub_event(channel_name, payload)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"[WARN] Redis subscriber loop hatası: {exc}")

    async def _handle_pubsub_event(self, channel_name: str, payload: dict[str, Any]) -> None:
        message_type = str(payload.get("message_type") or "")
        data = payload.get("data")
        exclude_socket_id = payload.get("exclude_socket_id")

        if channel_name.startswith("syncra:channel:"):
            channel_id = channel_name.removeprefix("syncra:channel:")
            await self._broadcast_local_channel(
                channel_id,
                message_type,
                data if isinstance(data, dict) else {},
                exclude_socket_id=int(exclude_socket_id) if exclude_socket_id is not None else None,
            )
            return

        if channel_name.startswith("syncra:server:"):
            server_id = channel_name.removeprefix("syncra:server:")
            await self._broadcast_local_server(
                server_id,
                message_type,
                data if isinstance(data, dict) else {},
            )
            return

        if channel_name == "syncra:discovery":
            await self._broadcast_local_discovery(
                message_type,
                data if isinstance(data, dict) else {},
            )

    async def _publish(self, redis_channel: str, payload: dict[str, Any]) -> bool:
        if not (self._redis_enabled and self._redis):
            return False
        try:
            await self._redis.publish(redis_channel, json.dumps(payload))
            return True
        except Exception as exc:
            print(f"[WARN] Redis publish hatası ({redis_channel}): {exc}")
            return False

    def _presence_key(self, server_id: str, user_id: str) -> str:
        return f"syncra:presence:{server_id}:{user_id}"

    def _channel_connections_key(self, channel_id: str) -> str:
        return f"syncra:channel_connections:{channel_id}"

    async def mark_channel_connection_open(self, channel_id: str) -> None:
        if not (self._redis_enabled and self._redis):
            return
        key = self._channel_connections_key(channel_id)
        await self._redis.incr(key)
        await self._redis.expire(key, 3600)

    async def mark_channel_connection_closed(self, channel_id: str) -> None:
        if not (self._redis_enabled and self._redis):
            return
        key = self._channel_connections_key(channel_id)
        value = await self._redis.decr(key)
        if value <= 0:
            await self._redis.delete(key)

    async def get_channel_connection_count(self, channel_id: str) -> int:
        if not (self._redis_enabled and self._redis):
            return len(self.active_connections.get(channel_id, []))

        raw_value = await self._redis.get(self._channel_connections_key(channel_id))
        try:
            return int(raw_value or 0)
        except Exception:
            return 0

    async def mark_user_server_connection_open(self, server_id: str, user_id: str) -> None:
        if not (self._redis_enabled and self._redis):
            return
        key = self._presence_key(server_id, user_id)
        await self._redis.incr(key)
        await self._redis.expire(key, 3600)

    async def mark_user_server_connection_closed(self, server_id: str, user_id: str) -> None:
        if not (self._redis_enabled and self._redis):
            return
        key = self._presence_key(server_id, user_id)
        value = await self._redis.decr(key)
        if value <= 0:
            await self._redis.delete(key)

    async def has_active_server_connection(self, server_id: str, user_id: str) -> bool:
        if not (self._redis_enabled and self._redis):
            return self.has_active_channel_connection_for_user(server_id, user_id)
        key = self._presence_key(server_id, user_id)
        raw_value = await self._redis.get(key)
        try:
            return int(raw_value or 0) > 0
        except Exception:
            return False

    async def connect(
        self,
        websocket: WebSocket,
        channel_id: str,
        server_id: str | None = None,
        user_id: str | None = None,
    ):
        await websocket.accept()
        if channel_id not in self.active_connections:
            self.active_connections[channel_id] = []
        self.active_connections[channel_id].append(websocket)

        if server_id and user_id:
            socket_key = id(websocket)
            pair_key = (server_id, user_id)
            self.channel_connection_context[socket_key] = pair_key
            self.user_server_connection_counts[pair_key] = (
                self.user_server_connection_counts.get(pair_key, 0) + 1
            )

    async def connect_server(self, websocket: WebSocket, server_id: str):
        """Connect to server-wide events"""
        await websocket.accept()
        if server_id not in self.server_connections:
            self.server_connections[server_id] = []
        self.server_connections[server_id].append(websocket)

    async def connect_discovery(self, websocket: WebSocket):
        """Connect to global discovery events"""
        await websocket.accept()
        self.discovery_connections.append(websocket)

    def disconnect(self, websocket: WebSocket, channel_id: str):
        if channel_id in self.active_connections:
            if websocket in self.active_connections[channel_id]:
                self.active_connections[channel_id].remove(websocket)
            if not self.active_connections[channel_id]:
                del self.active_connections[channel_id]

        socket_key = id(websocket)
        pair_key = self.channel_connection_context.pop(socket_key, None)
        if pair_key:
            current_count = self.user_server_connection_counts.get(pair_key, 0)
            if current_count <= 1:
                self.user_server_connection_counts.pop(pair_key, None)
            else:
                self.user_server_connection_counts[pair_key] = current_count - 1

    def has_active_channel_connection_for_user(self, server_id: str, user_id: str) -> bool:
        return self.user_server_connection_counts.get((server_id, user_id), 0) > 0

    def disconnect_server(self, websocket: WebSocket, server_id: str):
        """Disconnect from server-wide events"""
        if server_id in self.server_connections:
            if websocket in self.server_connections[server_id]:
                self.server_connections[server_id].remove(websocket)
            if not self.server_connections[server_id]:
                del self.server_connections[server_id]

    def disconnect_discovery(self, websocket: WebSocket):
        if websocket in self.discovery_connections:
            self.discovery_connections.remove(websocket)

    async def broadcast(self, channel_id: str, message_type: str, data: dict):
        """Genel amaçlı yayın fonksiyonu (Text, Update, System Notification vb.)"""
        redis_channel = f"syncra:channel:{channel_id}"
        payload = {
            "message_type": message_type,
            "data": data,
        }
        published = await self._publish(redis_channel, payload)
        if not published:
            await self._broadcast_local_channel(channel_id, message_type, data)

    async def broadcast_to_server(self, server_id: str, message_type: str, data: dict):
        """Broadcast to all connections in a server"""
        redis_channel = f"syncra:server:{server_id}"
        payload = {
            "message_type": message_type,
            "data": data,
        }
        published = await self._publish(redis_channel, payload)
        if not published:
            await self._broadcast_local_server(server_id, message_type, data)

    async def broadcast_discovery(self, message_type: str, data: dict):
        """Broadcast to all discovery listeners"""
        payload = {
            "message_type": message_type,
            "data": data,
        }
        published = await self._publish("syncra:discovery", payload)
        if not published:
            await self._broadcast_local_discovery(message_type, data)

    async def broadcast_text(self, channel_id: str, message: dict):
        # Eski fonksiyonu generic olana yönlendirelim
        await self.broadcast(channel_id, "text", message)


    async def broadcast_signal(self, channel_id: str, sender_socket: WebSocket, signal_data: dict):
        """WebRTC Sinyallerini (Ses) gönderen hariç diğerlerine ilet."""
        payload = {
            "message_type": "webrtc_signal",
            "data": signal_data,
            "exclude_socket_id": id(sender_socket),
        }
        redis_channel = f"syncra:channel:{channel_id}"
        published = await self._publish(redis_channel, payload)
        if not published:
            await self._broadcast_local_channel(
                channel_id,
                "webrtc_signal",
                signal_data,
                exclude_socket_id=id(sender_socket),
            )

    async def _broadcast_local_channel(
        self,
        channel_id: str,
        message_type: str,
        data: dict,
        exclude_socket_id: int | None = None,
    ) -> None:
        if channel_id not in self.active_connections:
            return

        payload = json.dumps({"type": message_type, "data": data})
        dead_connections: List[WebSocket] = []
        for connection in list(self.active_connections[channel_id]):
            if exclude_socket_id is not None and id(connection) == exclude_socket_id:
                continue
            try:
                await connection.send_text(payload)
            except Exception:
                dead_connections.append(connection)

        for connection in dead_connections:
            self.disconnect(connection, channel_id)

    async def _broadcast_local_server(self, server_id: str, message_type: str, data: dict) -> None:
        if server_id not in self.server_connections:
            return

        payload = json.dumps({"type": message_type, "data": data})
        dead_connections: List[WebSocket] = []
        for connection in list(self.server_connections[server_id]):
            try:
                await connection.send_text(payload)
            except Exception:
                dead_connections.append(connection)

        for connection in dead_connections:
            self.disconnect_server(connection, server_id)

    async def _broadcast_local_discovery(self, message_type: str, data: dict) -> None:
        if not self.discovery_connections:
            return

        payload = json.dumps({"type": message_type, "data": data})
        dead_connections: List[WebSocket] = []
        for connection in list(self.discovery_connections):
            try:
                await connection.send_text(payload)
            except Exception:
                dead_connections.append(connection)

        for connection in dead_connections:
            self.disconnect_discovery(connection)

    async def connect_user(self, websocket: WebSocket, user_id: str):
        if user_id not in self.user_connections:
            self.user_connections[user_id] = []
        self.user_connections[user_id].append(websocket)

    def disconnect_user(self, websocket: WebSocket, user_id: str):
        if user_id in self.user_connections:
            if websocket in self.user_connections[user_id]:
                self.user_connections[user_id].remove(websocket)
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]

    async def force_logout_user(self, user_id: str, new_session_id: str):
        """
        Kullanıcının TÜM aktif WebSocket bağlantılarını bul ve kapat.
        
        Redis Pub/Sub ile diğer process'lere de haber verilmeli.
        """
        # Local Connections Cleanup
        if user_id in self.user_connections:
            conns = list(self.user_connections[user_id])
            for ws in conns:
                # Session ID check can be done if we stored it, but since we want to force logout
                # all *previous* sessions, we can just close all.
                # Ideally, we should check if `ws.session_id` != `new_session_id`.
                # But `ws` object doesn't have `session_id` attribute unless we monkey-patch it.
                # Assuming `websockets.py` attached it.
                try:
                   if getattr(ws, "session_id", None) != new_session_id:
                       await ws.close(code=4001, reason="NewLogin")
                except Exception:
                   pass
        
        # Redis Broadcast to other workers
        if self._redis_enabled:
             await self._publish(f"syncra:user_logout:{user_id}", {"new_session_id": new_session_id})

manager = ConnectionManager()

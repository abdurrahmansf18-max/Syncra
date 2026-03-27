from sqlalchemy import (
    Column, MetaData, Integer, String, Text, Boolean, ForeignKey, DateTime, Enum, Index, text, UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.sql import func
import enum
import uuid
from app.db.base import Base

# === ENUMS (DDL ile %100 Uyumlu) ===
class UserStatus(str, enum.Enum):
    active = "active"
    disabled = "disabled"

class MemberRole(str, enum.Enum):
    admin = "admin"
    mod = "mod"
    member = "member"

class ChannelType(str, enum.Enum):
    text = "text"
    voice = "voice"

class ReportStatus(str, enum.Enum):
    open = "open"
    reviewing = "reviewing"
    resolved = "resolved"
    rejected = "rejected"

class AuditAction(str, enum.Enum):
    BAN = "BAN"
    UNBAN = "UNBAN"
    MUTE = "MUTE"
    UNMUTE = "UNMUTE"
    DELETE_MESSAGE = "DELETE_MESSAGE"
    RESOLVE_REPORT = "RESOLVE_REPORT"
    REJECT_REPORT = "REJECT_REPORT"
    ROLE_CHANGE = "ROLE_CHANGE"

# === MODELS ===

class User(Base):
    __tablename__ = "users"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(15), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    avatar_url = Column(String(1024), nullable=True)
    password_hash = Column(String, nullable=False)
    status = Column(Enum(UserStatus), nullable=False, default=UserStatus.active)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # İlişkiler
    server_memberships = relationship("ServerMembership", back_populates="user", foreign_keys="ServerMembership.user_id", cascade="all, delete-orphan")

class Server(Base):
    __tablename__ = "servers"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(10), nullable=False)
    handle = Column(String(40), unique=True, nullable=False)
    owner_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    is_published = Column(Boolean, nullable=False, default=False)
    invite_min_role = Column(Enum(MemberRole), nullable=False, default=MemberRole.member)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("uq_servers_owner_name_lower", "owner_id", text("lower(name)"), unique=True),
    )

    owner = relationship("User")
    memberships = relationship("ServerMembership", back_populates="server", cascade="all, delete-orphan")
    channels = relationship("Channel", back_populates="server", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="server", cascade="all, delete-orphan")
    invites = relationship("ServerInvite", back_populates="server", cascade="all, delete-orphan")

class ServerMembership(Base):
    __tablename__ = "server_memberships"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id = Column(PG_UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum(MemberRole), nullable=False, default=MemberRole.member)
    
    # Moderasyon
    is_banned = Column(Boolean, nullable=False, default=False)
    banned_reason = Column(Text)
    banned_by = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    banned_at = Column(DateTime(timezone=True))
    
    mute_until = Column(DateTime(timezone=True))
    muted_reason = Column(Text)
    muted_by = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    muted_at = Column(DateTime(timezone=True))
    
    # Online/Offline Durumu
    is_online = Column(Boolean, nullable=False, default=False)
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint('server_id', 'user_id', name='uq_membership'),)
    
    server = relationship("Server", back_populates="memberships")
    user = relationship("User", back_populates="server_memberships", foreign_keys=[user_id])
    
    # Optional relationships for moderation
    banned_by_user = relationship("User", foreign_keys=[banned_by])
    muted_by_user = relationship("User", foreign_keys=[muted_by])

class ServerInvite(Base):
    __tablename__ = "server_invites"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id = Column(PG_UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False)
    code = Column(String(24), unique=True, nullable=False)
    created_by = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    assigned_role = Column(Enum(MemberRole), nullable=False, default=MemberRole.member)
    max_uses = Column(Integer)
    uses_count = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    server = relationship("Server", back_populates="invites")

class Category(Base):
    __tablename__ = "categories"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id = Column(PG_UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(10), nullable=False)
    position = Column(Integer, nullable=False, default=0)
    is_published = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    server = relationship("Server", back_populates="categories")
    channels = relationship("Channel", back_populates="category")

class Channel(Base):
    __tablename__ = "channels"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id = Column(PG_UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False)
    category_id = Column(PG_UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"))
    name = Column(String(10), nullable=False)
    type = Column(Enum(ChannelType), nullable=False, default=ChannelType.text)
    position = Column(Integer, nullable=False, default=0)
    
    # Permissions
    min_role_to_view = Column(Enum(MemberRole), nullable=False, default=MemberRole.member)
    min_role_to_post = Column(Enum(MemberRole), nullable=False, default=MemberRole.member)
    is_published = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    server = relationship("Server", back_populates="channels")
    category = relationship("Category", back_populates="channels")

class Message(Base):
    __tablename__ = "messages"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id = Column(PG_UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False)
    channel_id = Column(PG_UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), nullable=False)
    author_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    content = Column(Text, nullable=False)
    is_deleted = Column(Boolean, nullable=False, default=False)
    deleted_by = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    deleted_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    author = relationship("User", foreign_keys=[author_id])
    deleter = relationship("User", foreign_keys=[deleted_by])

class MessageReport(Base):
    __tablename__ = "message_reports"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id = Column(PG_UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False)
    message_id = Column(PG_UUID(as_uuid=True), ForeignKey("messages.id", ondelete="CASCADE"), nullable=False)
    reporter_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reason = Column(Text)
    status = Column(Enum(ReportStatus), nullable=False, default=ReportStatus.open)
    reviewed_by = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at = Column(DateTime(timezone=True))
    resolution_note = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint('message_id', 'reporter_id', name='uq_report_once'),)

class VoicePresence(Base):
    __tablename__ = "voice_presence"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id = Column(PG_UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    channel_id = Column(PG_UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), nullable=False)
    joined_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint('server_id', 'user_id', name='uq_voice_one_per_server'),)

class Poll(Base):
    __tablename__ = "polls"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id = Column(PG_UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False)
    channel_id = Column(PG_UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    question = Column(Text, nullable=False)
    is_closed = Column(Boolean, nullable=False, default=False)
    closes_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    options = relationship("PollOption", back_populates="poll", cascade="all, delete-orphan")

class PollOption(Base):
    __tablename__ = "poll_options"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    poll_id = Column(PG_UUID(as_uuid=True), ForeignKey("polls.id", ondelete="CASCADE"), nullable=False)
    label = Column(String(120), nullable=False)
    position = Column(Integer, nullable=False, default=0)

    poll = relationship("Poll", back_populates="options")

class PollVote(Base):
    __tablename__ = "poll_votes"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    poll_id = Column(PG_UUID(as_uuid=True), ForeignKey("polls.id", ondelete="CASCADE"), nullable=False)
    option_id = Column(PG_UUID(as_uuid=True), ForeignKey("poll_options.id", ondelete="CASCADE"), nullable=False)
    voter_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    voted_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint('poll_id', 'voter_id', name='uq_one_vote_per_poll'),)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id = Column(PG_UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False)
    actor_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    target_user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    target_message_id = Column(PG_UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"))
    action = Column(Enum(AuditAction), nullable=False)
    reason = Column(Text)
    metadata_ = Column("metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
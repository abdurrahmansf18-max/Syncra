from pydantic import BaseModel, ConfigDict, Field, EmailStr, field_validator
from typing import Optional, List, Any, Literal
from datetime import datetime
from uuid import UUID
import re
from app.models.all import UserStatus, MemberRole, ChannelType, ReportStatus
 
 
def validate_entity_name(name: Optional[str]) -> Optional[str]:
    if name is None:
        return None
    trimmed = name.strip()
    if len(trimmed) < 3 or len(trimmed) > 10:
        raise ValueError("Ad en az 3, en fazla 10 karakter olmalıdır.")
    return trimmed


def validate_server_handle(handle: Optional[str]) -> Optional[str]:
    if handle is None:
        return None

    normalized = handle.strip().lower()
    normalized = re.sub(r"[^a-z0-9-]", "-", normalized)
    normalized = re.sub(r"-+", "-", normalized).strip("-")

    if len(normalized) < 3 or len(normalized) > 40:
        raise ValueError("Handle en az 3, en fazla 40 karakter olmalıdır.")

    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", normalized):
        raise ValueError("Handle sadece küçük harf, rakam ve tire içerebilir.")

    return normalized
 
 
# --- Generic Response Wrapper (Hata mesajları için) ---
class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[Any] = None
 
class ErrorResponse(BaseModel):
    error: ErrorDetail
 
# --- Token ---
class Token(BaseModel):
    access_token: str
    token_type: str
 
class TokenPayload(BaseModel):
    sub: Optional[str] = None
    exp: Optional[int] = None
 
# --- User ---
class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=15)
    email: EmailStr
 
class UserCreate(UserBase):
    password: str = Field(..., min_length=8)
 
    @field_validator('password')
    @classmethod
    def password_strong(cls, v: str) -> str:
        if not re.search(r'[A-Z]', v):
            raise ValueError('Şifre en az bir büyük harf içermelidir.')
        if not re.search(r'[a-z]', v):
            raise ValueError('Şifre en az bir küçük harf içermelidir.')
        if not re.search(r'\d', v):
            raise ValueError('Şifre en az bir rakam içermelidir.')
        if not re.search(r'[.@$!%*?&]', v):
            raise ValueError('Şifre en az bir özel karakter (.@$!%*?&) içermelidir.')
        return v
 
class UserUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=15)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=8)
 
    @field_validator('password')
    @classmethod
    def password_strong(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not re.search(r'[A-Z]', v):
            raise ValueError('Şifre en az bir büyük harf içermelidir.')
        if not re.search(r'[a-z]', v):
            raise ValueError('Şifre en az bir küçük harf içermelidir.')
        if not re.search(r'\d', v):
            raise ValueError('Şifre en az bir rakam içermelidir.')
        if not re.search(r'[.@$!%*?&]', v):
            raise ValueError('Şifre en az bir özel karakter (.@$!%*?&) içermelidir.')
        return v
 
class UserSchema(BaseModel):
    id: UUID
    username: str
    email: str
    avatar_url: Optional[str] = None
    status: UserStatus
    model_config = ConfigDict(from_attributes=True)
 
class LoginRequest(BaseModel):
    username: str
    password: str

class GoogleAuthRequest(BaseModel):
    id_token: str
    mode: Literal["login", "register"] = "login"
 
# --- Server ---
class ServerCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=10)
    handle: Optional[str] = Field(None, min_length=3, max_length=40)
    is_published: bool = False
    invite_min_role: MemberRole = MemberRole.member
 
    @field_validator('name')
    @classmethod
    def validate_server_name(cls, v: str) -> str:
        return validate_entity_name(v) or v

    @field_validator('handle')
    @classmethod
    def validate_handle(cls, v: Optional[str]) -> Optional[str]:
        return validate_server_handle(v)
 
class ServerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=3, max_length=10)
    handle: Optional[str] = Field(None, min_length=3, max_length=40)
    is_published: Optional[bool] = None
    invite_min_role: Optional[MemberRole] = None
 
    @field_validator('name')
    @classmethod
    def validate_server_name(cls, v: Optional[str]) -> Optional[str]:
        return validate_entity_name(v)

    @field_validator('handle')
    @classmethod
    def validate_handle(cls, v: Optional[str]) -> Optional[str]:
        return validate_server_handle(v)
 
class ServerSchema(BaseModel):
    id: UUID
    owner_id: UUID
    name: str
    handle: str
    is_published: bool
    invite_min_role: MemberRole
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)
 
# --- Membership ---
class MembershipSchema(BaseModel):
    server_id: UUID
    user_id: UUID
    role: MemberRole
    is_banned: bool
    mute_until: Optional[datetime]
    is_online: bool
    last_seen_at: datetime
    user: Optional[UserSchema] = None
   
    model_config = ConfigDict(from_attributes=True)
 
class MemberUpdate(BaseModel):
    role: Optional[MemberRole] = None
    is_banned: Optional[bool] = None
    banned_reason: Optional[str] = None
    mute_until: Optional[datetime] = None
    muted_reason: Optional[str] = None
 
# --- Invite ---
class InviteCreate(BaseModel):
    assigned_role: MemberRole = MemberRole.member
    max_uses: Optional[int] = None
    expires_at: Optional[datetime] = None
 
class InviteSchema(BaseModel):
    code: str
    server_id: UUID
    server_name: Optional[str] = None
    assigned_role: MemberRole
    uses_count: int
    max_uses: Optional[int]
    expires_at: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)
 
# --- Channel & Category ---
class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=10)
    position: int = 0
    is_published: bool = False
 
    @field_validator('name')
    @classmethod
    def validate_category_name(cls, v: str) -> str:
        return validate_entity_name(v) or v
 
class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=3, max_length=10)
    position: Optional[int] = None
    is_published: Optional[bool] = None
 
    @field_validator('name')
    @classmethod
    def validate_category_name(cls, v: Optional[str]) -> Optional[str]:
        return validate_entity_name(v)
 
class CategorySchema(BaseModel):
    id: UUID
    server_id: UUID
    name: str
    position: int
    is_published: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
 
class ChannelCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=10)
    type: ChannelType
    category_id: Optional[UUID] = None
    min_role_to_view: MemberRole = MemberRole.member
    min_role_to_post: MemberRole = MemberRole.member
    is_published: bool = False
 
    @field_validator('name')
    @classmethod
    def validate_channel_name(cls, v: str) -> str:
        return validate_entity_name(v) or v
 
class ChannelUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=3, max_length=10)
    category_id: Optional[UUID] = None
    min_role_to_view: Optional[MemberRole] = None
    min_role_to_post: Optional[MemberRole] = None
    is_published: Optional[bool] = None
 
    @field_validator('name')
    @classmethod
    def validate_channel_name(cls, v: Optional[str]) -> Optional[str]:
        return validate_entity_name(v)
 
 
class ChannelPublishUpdate(BaseModel):
    is_published: bool
 
class ChannelSchema(BaseModel):
    id: UUID
    server_id: UUID
    name: str
    type: ChannelType
    category_id: Optional[UUID]
    min_role_to_view: MemberRole
    min_role_to_post: MemberRole
    is_published: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
 
# --- Message ---
class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1)
 
class MessageSchema(BaseModel):
    id: UUID
    author_id: UUID
    content: str
    created_at: datetime
    is_deleted: bool
    author: Optional[UserSchema] = None  # Yazarın adını göstermek için
    model_config = ConfigDict(from_attributes=True)
 
# --- Report ---
class ReportCreate(BaseModel):
    reason: str
 
class ReportSchema(BaseModel):
    id: UUID
    server_id: UUID
    message_id: UUID
    created_at: datetime
    reporter_id: Optional[UUID]
    status: ReportStatus
    reason: Optional[str]
    resolution_note: Optional[str] = None
    reporter: Optional[UserSchema] = None
    reported_user: Optional[UserSchema] = None
    message_content: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class ReportUpdate(BaseModel):
    status: ReportStatus
    resolution_note: Optional[str] = None

class MyReportsResponse(BaseModel):
    submitted: List[ReportSchema]
    received: List[ReportSchema]
 
# --- Voice ---
class VoiceState(BaseModel):
    user_id: UUID
    channel_id: UUID
    model_config = ConfigDict(from_attributes=True)


class VoiceParticipantSchema(UserSchema):
    mute_until: Optional[datetime] = None
 
 
# --- Poll ---
class PollOptionBase(BaseModel):
    label: str
 
class PollOptionCreate(PollOptionBase):
    pass
 
class PollOptionSchema(PollOptionBase):
    id: UUID
    poll_id: UUID
    position: int
    vote_count: int = 0
    vote_percent: float = 0
    model_config = ConfigDict(from_attributes=True)
 
class PollCreate(BaseModel):
    server_id: UUID
    channel_id: UUID
    question: str
    options: List[str]  # ['Evet', 'Hayır']
 
class PollSchema(BaseModel):
    id: UUID
    server_id: UUID
    channel_id: UUID
    created_by: UUID
    question: str
    is_closed: bool
    closes_at: Optional[datetime]
    created_at: datetime
    total_votes: int = 0
    my_vote_option_id: Optional[UUID] = None
    options: List[PollOptionSchema] = []
   
    model_config = ConfigDict(from_attributes=True)
 
class VoteCreate(BaseModel):
    option_id: UUID
 
class VoteResult(BaseModel):
    poll_id: UUID
    voter_id: UUID
    option_id: UUID
    model_config = ConfigDict(from_attributes=True)
 
# --- Stats ---
class StatsSchema(BaseModel):
    total_messages: int
    active_voice_users: int
    total_members: int
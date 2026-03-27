from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_FILE), case_sensitive=True)

    PROJECT_NAME: str = "Syncra"
    API_V1_STR: str = "/api/v1"
    
    # DB (DDL file ile %100 uyumlu)
    DATABASE_URL: str = "postgresql://postgres:admin@localhost:5432/Syncra"

    # Security
    SECRET_KEY: str = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 1 gün
    GOOGLE_CLIENT_ID: str | None = None

    # WebRTC ICE (STUN/TURN)
    WEBRTC_STUN_URLS: str = "stun:stun.l.google.com:19302"
    WEBRTC_TURN_URL: str | None = None
    WEBRTC_TURN_USERNAME: str | None = None
    WEBRTC_TURN_PASSWORD: str | None = None

    # Realtime scaling (optional)
    REDIS_URL: str | None = None

    # Application Limits
    MAX_USERS: int = 200
    MAX_OWNED_SERVERS_PER_USER: int = 2
    MAX_JOINED_SERVERS_PER_USER: int = 20
    MAX_MEMBERS_PER_SERVER: int = 25
    MAX_TEXT_CHANNELS_PER_SERVER: int = 10
    MAX_VOICE_CHANNELS_PER_SERVER: int = 3
    MAX_MESSAGE_LENGTH: int = 1000

settings = Settings()

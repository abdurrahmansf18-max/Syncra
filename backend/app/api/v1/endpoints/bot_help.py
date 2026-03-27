from typing import Any, List
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class BotCommandInfo(BaseModel):
    command: str
    description: str
    usage: str

class BotHelpResponse(BaseModel):
    commands: List[BotCommandInfo]

@router.get("/bot/help", response_model=BotHelpResponse)
def get_bot_help() -> Any:
    """
    Mevcut bot komutlarının listesini ve açıklamalarını döndürür (/help).
    """
    return {
        "commands": [
            {
                "command": "/poll",
                "description": "Yeni bir anket oluşturur. (Sadece Mod/Admin)",
                "usage": "/poll {soru} {seçenek1} {seçenek2}..."
            },
            {
                "command": "/stats",
                "description": "Sunucu istatistiklerini (Mesaj, Ses, Üye sayısı) gösterir.",
                "usage": "/stats"
            },
            {
                "command": "/help",
                "description": "Bot komut listesini gösterir.",
                "usage": "/help"
            }
        ]
    }

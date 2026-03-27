from fastapi import FastAPI, Depends, Request
from fastapi.staticfiles import StaticFiles
import os
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.core import config, exceptions
from app.core.socket_manager import manager
from app.db.session import engine
from app.db.base import Base
from app.models import all as models

app = FastAPI(
    title="Syncra API",
    openapi_url=f"{config.settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Ensure uploads directory exists
os.makedirs("static/uploads", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/api/v1/static", StaticFiles(directory="static"), name="static_api_v1")

@app.on_event("startup")
async def startup_event() -> None:
    # --- DB Init (Lazy) ---
    try:
        # Create tables if not exist
        Base.metadata.create_all(bind=engine)
        
        # Lightweight schema sync for existing databases
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE server_invites ADD COLUMN IF NOT EXISTS assigned_role member_role NOT NULL DEFAULT 'member'"
                )
            )
            conn.execute(
                text(
                    "ALTER TABLE servers ADD COLUMN IF NOT EXISTS invite_min_role member_role NOT NULL DEFAULT 'member'"
                )
            )
            # Duplicate removed, safer check
            conn.execute(
                text(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(1024) DEFAULT NULL"
                )
            )
    except Exception as e:
        print(f"[WARN] DB Init / Schema sync skipped or failed: {e}")

    await manager.startup()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    await manager.shutdown()

# --- CORS ---
origins = [
    "http://localhost:3000",
    "http://localhost:8000",
    "https://app.syncra.website",
    "https://api.syncra.website",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Global Exception Handler (Tüm hatalar tek formatta) ---
@app.exception_handler(exceptions.SyncraBaseException)
async def syncra_exception_handler(request: Request, exc: exceptions.SyncraBaseException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.detail, "details": exc.details}}
    )

from fastapi.exceptions import RequestValidationError
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    details = []
    for error in exc.errors():
        msg = error.get("msg")
        if msg.startswith("Value error, "):
            msg = msg.replace("Value error, ", "")
        details.append(msg)
    
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Girdiğiniz verilerde hata var.",
                "details": details
            }
        }
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": "Beklenmeyen sunucu hatası.", "details": str(exc)}}
    )

# --- ROUTERS ---
from app.api.v1.endpoints import (
    auth, servers, invites, channels, messages, memberships, voice, reports, polls, stats, bot_help, websockets
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(servers.router, prefix="/api/v1/servers", tags=["servers"])
app.include_router(invites.router, prefix="/api/v1", tags=["invites"])
app.include_router(channels.router, prefix="/api/v1", tags=["channels"])
app.include_router(messages.router, prefix="/api/v1", tags=["messages"])
app.include_router(memberships.router, prefix="/api/v1", tags=["memberships"])
app.include_router(voice.router, prefix="/api/v1", tags=["voice"])
app.include_router(reports.router, prefix="/api/v1", tags=["reports"])
app.include_router(polls.router, prefix="/api/v1", tags=["polls"])
app.include_router(stats.router, prefix="/api/v1", tags=["stats"])
app.include_router(bot_help.router, prefix="/api/v1", tags=["bot"])
app.include_router(websockets.router, prefix="/ws/v1", tags=["websockets"]) # WebSocket Router (/ws prefix)



@app.get("/")
def read_root():
    return {"message": "Welcome to Syncra API", "docs": "/docs"}

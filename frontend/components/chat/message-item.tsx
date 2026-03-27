"use client";

import { useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { Message, MemberRole } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Flag, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  message: Message;
  serverId: string;
  myRole?: MemberRole;
  onDeleted?: (messageId: string) => void;
}

function getAvatarStyle(userKey?: string): {
  ringClass: string;
  ringStyle: CSSProperties;
  innerStyle: CSSProperties;
} {
  if (!userKey) {
    return {
      ringClass: "text-primary",
      ringStyle: { color: "hsl(var(--primary))" },
      innerStyle: {
        backgroundColor: "hsl(var(--primary) / 0.2)",
        color: "hsl(var(--primary))",
      },
    };
  }

  let hash = 0;
  for (let index = 0; index < userKey.length; index += 1) {
    hash = (hash * 31 + userKey.charCodeAt(index)) >>> 0;
  }

  const hue = hash % 360;

  return {
    ringClass: "text-foreground",
    ringStyle: {
      color: `hsl(${hue} 85% 62%)`,
    },
    innerStyle: {
      backgroundColor: `hsl(${hue} 90% 55% / 0.18)`,
      color: `hsl(${hue} 90% 68%)`,
    },
  };
}

export function MessageItem({ message, serverId, myRole, onDeleted }: Props) {
  const { user } = useAuth();
  const [showReport, setShowReport] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [reason, setReason] = useState("");
  const [reported, setReported] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const lastTapAtRef = useRef<number>(0);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  const pressMovedRef = useRef(false);

  const rawUsername = message.author?.username?.trim() || "";
  const isDeletedAccountMessage =
    message.author?.status === "disabled" && rawUsername.startsWith("deleted-");
  const displayUsername = isDeletedAccountMessage
    ? "Hesabını Silmiş Kullanıcı"
    : rawUsername || "Bilinmeyen";
  const avatarInitials = isDeletedAccountMessage
    ? "HS"
    : displayUsername.slice(0, 2).toUpperCase();

  const normalizeId = (value?: string) =>
    (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const messageAuthorId = message.author?.id || message.author_id;
  const isOwnById =
    normalizeId(user?.id) !== "" && normalizeId(user?.id) === normalizeId(messageAuthorId);
  const isOwnByUsername =
    Boolean(user?.username?.trim()) &&
    Boolean(message.author?.username?.trim()) &&
    user!.username.trim().toLowerCase() === message.author!.username.trim().toLowerCase();
  const isOwnByEmail =
    Boolean(user?.email?.trim()) &&
    Boolean(message.author?.email?.trim()) &&
    user!.email.trim().toLowerCase() === message.author!.email.trim().toLowerCase();
  const isOwn = isOwnById || isOwnByUsername || isOwnByEmail;
  const createdAt = new Date(message.created_at);
  
  const canDeleteOwnMessage = isOwn && Date.now() - createdAt.getTime() <= 2 * 60 * 60 * 1000;
  const canModerate = myRole === "admin" || myRole === "mod";
  const canDelete = isOwn ? canDeleteOwnMessage : canModerate;

  const time = new Date(message.created_at).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const avatarStyle = getAvatarStyle(message.author_id || displayUsername);

  const handleReport = async () => {
    try {
      await api.post(`/messages/${message.id}/report`, { reason });
      setReported(true);
      setShowReport(false);
      setReason("");
    } catch {
      // ignore
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/messages/${message.id}`);
      onDeleted?.(message.id);
    } catch {
      // ignore
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") {
      return;
    }

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTriggeredRef.current = false;
    pressMovedRef.current = false;
    pressStartRef.current = { x: event.clientX, y: event.clientY };
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setShowActions(true);
    }, 450);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !pressStartRef.current) {
      return;
    }

    const distanceX = Math.abs(event.clientX - pressStartRef.current.x);
    const distanceY = Math.abs(event.clientY - pressStartRef.current.y);
    if (distanceX > 10 || distanceY > 10) {
      pressMovedRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") {
      return;
    }

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (pressMovedRef.current) {
      pressStartRef.current = null;
      return;
    }

    if (longPressTriggeredRef.current) {
      pressStartRef.current = null;
      return;
    }

    const now = Date.now();
    if (now - lastTapAtRef.current < 280) {
      setShowActions(true);
    }
    lastTapAtRef.current = now;
    pressStartRef.current = null;
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") {
      return;
    }

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressStartRef.current = null;
    pressMovedRef.current = false;
  };

  const handleOpenActions = () => {
    setShowActions(true);
  };

  if (message.is_deleted) {
    return (
      <div className="group flex items-start gap-2 sm:gap-3 px-1 py-1.5">
        <div className="relative h-8 w-8 sm:h-10 sm:w-10 shrink-0">
          <span
            className={cn(
              "absolute inset-0 rounded-full border-2",
              avatarStyle.ringClass,
              "border-current",
            )}
            style={avatarStyle.ringStyle}
          />
          <span
            className="absolute inset-[2px] flex items-center justify-center rounded-full text-xs font-semibold"
            style={avatarStyle.innerStyle}
          >
            {avatarInitials || "??"}
          </span>
        </div>
        <div>
          <p className="text-xs sm:text-sm italic text-muted-foreground/60">
            Bu mesaj silindi.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "group flex items-start gap-2 sm:gap-3 px-2 py-2",
          isOwn ? "justify-end" : "justify-start"
        )}
      >
        {/* Avatar */}
        {!isOwn && (
          <div
            className="relative h-8 w-8 sm:h-10 sm:w-10 shrink-0"
          >
            {message.author?.avatar_url ? (
               <img 
                  src={message.author.avatar_url.startsWith("http") ? message.author.avatar_url : `${process.env.NEXT_PUBLIC_API_URL}${message.author.avatar_url}`}
                  alt={displayUsername}
                  className="h-full w-full rounded-full object-cover border-2 border-border"
               />
            ) : (
              <>
                <span
                  className={cn(
                    "absolute inset-0 rounded-full border-2",
                    avatarStyle.ringClass,
                    "border-current",
                  )}
                  style={avatarStyle.ringStyle}
                />
                <span
                  className="absolute inset-[2px] flex items-center justify-center rounded-full text-xs font-semibold"
                  style={avatarStyle.innerStyle}
                >
                  {avatarInitials || "??"}
                </span>
              </>
            )}
          </div>
        )}

        {/* Content */}
        <div
          className={cn(
            "relative flex w-fit min-w-0 max-w-[85%] flex-col rounded-[22px] px-4 py-2.5 shadow-sm transition-all sm:max-w-[75%]",
            isOwn
              ? "rounded-tr-none border border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90"
              : "rounded-tl-none border border-border bg-card hover:bg-muted/50 text-foreground"
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onDoubleClick={handleOpenActions}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="mb-0.5 flex items-baseline gap-2">
             {!isOwn && (
                <span className={cn("text-xs font-bold leading-none tracking-wide", isOwn ? "text-primary-foreground/90" : "text-primary")}>
                  {displayUsername}
                </span>
             )}
            <span className={cn("text-[10px] leading-none opacity-60", isOwn ? "text-primary-foreground" : "text-muted-foreground")}>
              {time}
            </span>
          </div>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-[15px] leading-relaxed">
            {message.content}
          </p>
        </div>

        <div className="w-7 shrink-0 pt-1 flex justify-center">
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-foreground text-base sm:text-lg"
              >
                <span className="leading-none">...</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isOwn ? (
                canDeleteOwnMessage ? (
                  <DropdownMenuItem
                    onClick={handleDelete}
                    className="text-destructive text-xs sm:text-sm"
                  >
                    <Trash2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                    Mesaji Sil
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    disabled
                    className="text-xs sm:text-sm"
                  >
                    Silme suresi doldu (2 saat)
                  </DropdownMenuItem>
                )
              ) : (
                <>
                  <DropdownMenuItem
                    onClick={() => setShowReport(true)}
                    disabled={reported}
                    className="text-xs sm:text-sm"
                  >
                    <Flag className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                    {reported ? "Sikayet Gonderildi" : "Sikayet Et"}
                  </DropdownMenuItem>
                  
                  {canModerate && (
                     <DropdownMenuItem
                      onClick={handleDelete}
                      className="text-destructive text-xs sm:text-sm"
                    >
                      <Trash2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                      Mesaji Sil (Mod)
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isOwn && (
          <div
            className="relative h-8 w-8 sm:h-10 sm:w-10 shrink-0"
          >
            {user?.avatar_url ? (
               <img 
                  src={user.avatar_url.startsWith("http") ? user.avatar_url : `${process.env.NEXT_PUBLIC_API_URL}${user.avatar_url}`}
                  alt={displayUsername}
                  className="h-full w-full rounded-full object-cover border-2 border-border"
               />
            ) : (
               <>
                <span
                  className={cn(
                    "absolute inset-0 rounded-full border-2",
                    avatarStyle.ringClass,
                    "border-current",
                  )}
                  style={avatarStyle.ringStyle}
                />
                <span
                  className="absolute inset-[2px] flex items-center justify-center rounded-full text-xs font-semibold"
                  style={avatarStyle.innerStyle}
                >
                  {avatarInitials || "??"}
                </span>
               </>
            )}
          </div>
        )}
      </div>

      {/* Report Dialog */}
      <Dialog open={showActions} onOpenChange={setShowActions}>
        <DialogContent className="bg-card w-[92vw] sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-foreground text-sm sm:text-base">
              Mesaj Islemleri
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {isOwn ? (
              canDeleteOwnMessage ? (
                <Button
                  variant="destructive"
                  className="text-xs sm:text-sm"
                  onClick={async () => {
                    await handleDelete();
                    setShowActions(false);
                  }}
                >
                  Mesaji Sil
                </Button>
              ) : (
                <Button variant="secondary" className="text-xs sm:text-sm" disabled>
                  Silme suresi doldu (2 saat)
                </Button>
              )
            ) : (
              <>
                <Button
                  variant="secondary"
                  className="text-xs sm:text-sm"
                  disabled={reported}
                  onClick={() => {
                    setShowActions(false);
                    setShowReport(true);
                  }}
                >
                  {reported ? "Sikayet Gonderildi" : "Sikayet Et"}
                </Button>
                
                {canModerate && (
                  <Button
                    variant="destructive"
                    className="text-xs sm:text-sm"
                    onClick={async () => {
                      await handleDelete();
                      setShowActions(false);
                    }}
                  >
                    Mesaji Sil (Mod)
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="bg-card w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground text-sm sm:text-base">
              Mesaji Sikayet Et
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Sebep
            </Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Neden bildiriyorsunuz?"
              className="bg-background text-xs sm:text-sm"
            />
            <Button
              onClick={handleReport}
              disabled={!reason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs sm:text-sm"
            >
              Bildir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

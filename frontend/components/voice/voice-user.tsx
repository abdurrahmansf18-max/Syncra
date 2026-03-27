"use client"

import { cn } from "@/lib/utils"
import { Mic, MicOff, VolumeX, Volume2 } from "lucide-react"

interface Props {
  userId: string
  username?: string
  isCurrentUser: boolean
  isSpeaking: boolean
  hue: number
  isLocallyMuted?: boolean
  onToggleLocalMute?: () => void
}

export function VoiceUser({
  userId,
  username,
  isCurrentUser,
  isSpeaking,
  hue,
  isLocallyMuted = false,
  onToggleLocalMute,
}: Props) {
  const initials = (username?.trim().slice(0, 2) || "??").toUpperCase()
  const ringColor = `hsl(${hue} 85% 58%)`

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={cn(
          "relative flex h-16 w-16 items-center justify-center rounded-full text-sm font-bold border-2",
          isCurrentUser
            ? "bg-primary text-primary-foreground"
            : "bg-accent text-foreground"
        )}
        style={{
          borderColor: ringColor,
          opacity: isSpeaking ? 1 : 0.55,
          boxShadow: isSpeaking ? `0 0 16px ${ringColor}` : `0 0 0px ${ringColor}`,
          transition: "opacity 180ms ease, box-shadow 180ms ease",
        }}
      >
        {initials}
        <div
          className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full"
          style={{ backgroundColor: ringColor }}
        >
          {isSpeaking ? (
            <Mic className="h-3 w-3 text-white" />
          ) : (
            <MicOff className="h-3 w-3 text-white" />
          )}
        </div>
      </div>
      <span className="max-w-[80px] truncate text-xs text-muted-foreground">
        {isCurrentUser ? "Sen" : username || "Kullanici"}
      </span>

      {!isCurrentUser && onToggleLocalMute && (
        <button
          onClick={onToggleLocalMute}
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] transition-colors",
            isLocallyMuted
              ? "bg-orange-500/20 text-orange-500 hover:bg-orange-500/30"
              : "bg-background text-muted-foreground hover:bg-orange-500/10 hover:text-orange-500"
          )}
        >
          {isLocallyMuted ? (
            <>
              <Volume2 className="h-3 w-3" />
              Sesi Ac
            </>
          ) : (
            <>
              <VolumeX className="h-3 w-3" />
              Sesi Kapat
            </>
          )}
        </button>
      )}
    </div>
  )
}

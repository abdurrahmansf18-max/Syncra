"use client"

import { useEffect, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { useVoice } from "@/lib/voice-context"
import { Button } from "@/components/ui/button"
import { Mic, MicOff, PhoneCall, PhoneOff, Volume2, VolumeX } from "lucide-react"
import { VoiceUser } from "./voice-user"

interface Props {
  channelId: string
  channelName: string
}

export function VoiceRoom({ channelId, channelName }: Props) {
  const { user } = useAuth()
  const {
    joinChannel,
    leaveChannel,
    participants,
    joined,
    loading,
    error,
    speakingUsers,
    locallyMutedUsers,
    micMuted,
    toggleMicMute,
    toggleLocalMuteForUser,
    isMutedByModerator,
    muteRemainingText,
    currentChannelId,
  } = useVoice()

  // Ensure we are viewing/connected to the right channel
  useEffect(() => {
    // If we're not connected to ANY channel, or not connected to THIS channel,
    // we want to give the user the option to join, or auto-join?
    // User requested: "Don't disconnect while navigating chat".
    // If they navigate TO this page, it implies they want to check THIS channel.
    // If they are connected to ANOTHER channel, we shouldn't force-switch.
    // Let the user decide via UI.
    // But if not connected at all, maybe distinct behavior?
    // Actually, originally the component joined on mount.
    // Let's keep manual join or explicit join button for now.
    // BUT the original code did: handleJoin() on user interaction or explicit?
    // Original code had useEffect hook logic but only for setup, handled join via button or imperative?
    // Original code had handleJoin manually invoked.
  }, []) // Removed auto-join to be safe, let user click "Join".

  const getUserHue = useCallback((userId: string) => {
    let hash = 0
    for (let index = 0; index < userId.length; index += 1) {
      hash = (hash * 31 + userId.charCodeAt(index)) >>> 0
    }
    return hash % 360
  }, [])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 sm:gap-6 sm:p-6">
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent sm:h-16 sm:w-16">
          <Volume2 className="h-6 w-6 text-primary sm:h-8 sm:w-8" />
        </div>
        <h2 className="text-base font-bold text-foreground sm:text-lg">{channelName}</h2>
        <p className="text-xs text-muted-foreground sm:text-sm">Ses Kanali - {participants.length} kisi</p>
      </div>
      
      {error && (
         <div className="text-sm text-destructive font-medium">{error}</div>
      )}

      <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
        {participants.map((p) => (
          <VoiceUser
            key={p.id}
            userId={p.id}
            username={p.username}
            isCurrentUser={p.id === user?.id}
            isSpeaking={Boolean(speakingUsers[p.id])}
            hue={getUserHue(p.id)}
            isLocallyMuted={Boolean(locallyMutedUsers[p.id])}
            onToggleLocalMute={p.id === user?.id ? undefined : () => toggleLocalMuteForUser(p.id)}
          />
        ))}
        {participants.length === 0 && <p className="text-sm text-muted-foreground">Henuz kimse katilmadi.</p>}
      </div>

      <div className="flex items-center gap-2">
        {joined && (currentChannelId === channelId) ? (
          <>
          <Button onClick={toggleMicMute} variant="secondary" className="gap-2" disabled={isMutedByModerator}>
            {micMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {micMuted ? "Mic Ac" : "Mic Kapat"}
          </Button>
          <Button onClick={leaveChannel} disabled={loading} variant="destructive" className="gap-2">
            <PhoneOff className="h-4 w-4" />
            {loading ? "Cikiliyor..." : "Ayril"}
          </Button>
          </>
        ) : (
          <Button
            onClick={() => joinChannel(channelId, channelName)}
            disabled={loading}
            className="gap-2 bg-[hsl(var(--success))] text-primary-foreground hover:bg-[hsl(var(--success))]/90"
          >
            <PhoneCall className="h-4 w-4" />
            {loading ? "Katiliniyor..." : "Katil"}
          </Button>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <VolumeX className="h-3.5 w-3.5" />
          Kisi kartindan sesi kapatirsan sadece sen duymazsin.
        </span>
      </div>

      {isMutedByModerator && (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Moderator/Admin tarafindan susturuldun. Kalan sure: {muteRemainingText}
        </div>
      )}
    </div>
  )
}

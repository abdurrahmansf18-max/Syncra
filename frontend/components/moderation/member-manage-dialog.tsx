"use client"

import { useState } from "react"
import { api } from "@/lib/api"
import type { Membership, MemberRole } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ROLE_HIERARCHY } from "@/lib/constants"
import { ShieldAlert, VolumeX, Ban, UserMinus } from "lucide-react"

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  member: Membership
  serverId: string
  myRole: MemberRole
  onUpdated: () => void
}

export function MemberManageDialog({
  open,
  onOpenChange,
  member,
  serverId,
  myRole,
  onUpdated,
}: Props) {
  const [role, setRole] = useState<MemberRole>(member.role)
  const [banReason, setBanReason] = useState("")
  const [muteMinutes, setMuteMinutes] = useState("10")
  const [muteReason, setMuteReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const isAdmin = myRole === "admin"
  const muteUntilDate = member.mute_until ? new Date(member.mute_until) : null
  const isMutedNow = !!(muteUntilDate && muteUntilDate.getTime() > Date.now())

  const getRemainingMuteText = () => {
    if (!muteUntilDate) return ""
    const totalMs = muteUntilDate.getTime() - Date.now()
    if (totalMs <= 0) return ""

    const totalMinutes = Math.ceil(totalMs / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    if (hours > 0) {
      return `${hours}s ${minutes}d`
    }
    return `${minutes}d`
  }

  const handleRoleChange = async () => {
    setLoading(true)
    setError("")
    try {
      await api.patch(`/servers/${serverId}/members/${member.user_id}`, {
        role,
      })
      onUpdated()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Islem basarisiz")
    } finally {
      setLoading(false)
    }
  }

  const handleBan = async () => {
    setLoading(true)
    setError("")
    try {
      await api.patch(`/servers/${serverId}/members/${member.user_id}`, {
        is_banned: !member.is_banned,
        banned_reason: banReason || undefined,
      })
      onUpdated()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Islem basarisiz")
    } finally {
      setLoading(false)
    }
  }

  const handleKick = async () => {
    setLoading(true)
    setError("")
    try {
      await api.delete(`/servers/${serverId}/members/${member.user_id}`)
      onUpdated()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Islem basarisiz")
    } finally {
      setLoading(false)
    }
  }

  const handleMute = async () => {
    setLoading(true)
    setError("")
    try {
      if (isMutedNow) {
        await api.patch(`/servers/${serverId}/members/${member.user_id}`, {
          mute_until: null,
          muted_reason: null,
        })
      } else {
        const minutes = parseInt(muteMinutes) || 10
        const muteUntil = new Date(Date.now() + minutes * 60000).toISOString()
        await api.patch(`/servers/${serverId}/members/${member.user_id}`, {
          mute_until: muteUntil,
          muted_reason: muteReason || undefined,
        })
      }
      onUpdated()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Islem basarisiz")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {member.user?.username || "Uye"} - Yonetim
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Role Change (Admin only) */}
          {isAdmin && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldAlert className="h-4 w-4 text-primary" />
                Rol Degistir
              </div>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as MemberRole)}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="mod">Moderator</SelectItem>
                  <SelectItem value="member">Uye</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleRoleChange}
                disabled={loading || role === member.role}
                className="bg-primary text-primary-foreground"
              >
                Rolu Kaydet
              </Button>
            </div>
          )}

          {/* Mute */}
          {ROLE_HIERARCHY[myRole] > ROLE_HIERARCHY[member.role] && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <VolumeX className="h-4 w-4 text-[hsl(var(--warning))]" />
                Sustur
              </div>
              {isMutedNow && (
                <p className="text-xs text-destructive">
                  Kalan sure: {getRemainingMuteText()}
                </p>
              )}
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={muteMinutes}
                  onChange={(e) => setMuteMinutes(e.target.value)}
                  placeholder="Dakika"
                  className="w-24 bg-background"
                  disabled={isMutedNow}
                />
                <span className="self-center text-xs text-muted-foreground">
                  dakika
                </span>
              </div>
              <Input
                value={muteReason}
                onChange={(e) => setMuteReason(e.target.value)}
                placeholder="Sebep (istege bagli)"
                className="bg-background"
                disabled={isMutedNow}
              />
              <Button
                size="sm"
                variant="destructive"
                onClick={handleMute}
                disabled={loading}
              >
                {isMutedNow ? "Susturmayi Kaldir" : "Sustur"}
              </Button>
            </div>
          )}

          {/* Kick */}
          {ROLE_HIERARCHY[myRole] > ROLE_HIERARCHY[member.role] && !member.is_banned && (
            <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <UserMinus className="h-4 w-4" />
                Sunucudan At (Kick)
              </div>
              <p className="text-xs text-muted-foreground">
                Kullanici sunucudan atilacak ancak tekrar katilabilir.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={handleKick}
                disabled={loading}
              >
                Sunucudan At
              </Button>
            </div>
          )}

          {/* Ban */}
          {ROLE_HIERARCHY[myRole] > ROLE_HIERARCHY[member.role] && (
            <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <Ban className="h-4 w-4" />
                {member.is_banned ? "Engellemeyi Kaldir" : "Engelle"}
              </div>
              {!member.is_banned && (
                <Input
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Sebep (istege bagli)"
                  className="bg-background"
                />
              )}
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBan}
                disabled={loading}
              >
                {member.is_banned ? "Engellemeyi Kaldir" : "Engelle"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

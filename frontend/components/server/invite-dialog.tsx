"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { Invite, MemberRole } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Copy, Check } from "lucide-react"

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  serverId: string
  myRole?: MemberRole
  inviteMinRole?: MemberRole
}

export function InviteDialog({ open, onOpenChange, serverId, myRole, inviteMinRole }: Props) {
  const [invite, setInvite] = useState<Invite | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [assignedRole, setAssignedRole] = useState<MemberRole>("member")
  const effectiveMyRole = myRole || "member"
  const effectiveMinRole = inviteMinRole || "member"

  const roleRank: Record<MemberRole, number> = {
    admin: 3,
    mod: 2,
    member: 1,
  }

  const canCreate = roleRank[effectiveMyRole] >= roleRank[effectiveMinRole]
  const canAssign = (role: MemberRole) => roleRank[role] <= roleRank[effectiveMyRole]

  const roleLabel: Record<MemberRole, string> = {
    member: "Uye",
    mod: "Moderator",
    admin: "Admin",
  }

  useEffect(() => {
    if (!canAssign(assignedRole)) {
      setAssignedRole("member")
    }
  }, [assignedRole, effectiveMyRole])

  const createInvite = async () => {
    setLoading(true)
    try {
      const inv = await api.post<Invite>(`/servers/${serverId}/invites`, {
        assigned_role: assignedRole,
      })
      setInvite(inv)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const copyCode = () => {
    if (!invite) return
    const url = `${window.location.origin}/invite/${invite.code}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setInvite(null)
          setCopied(false)
          setAssignedRole("member")
        }
        onOpenChange(v)
      }}
    >
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Arkadaslarini Davet Et
          </DialogTitle>
        </DialogHeader>
        {invite ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Bu linki paylasarak arkadaslarini sunucuya davet edebilirsin.
            </p>
            <p className="text-xs text-muted-foreground">
              Bu davet ile katilan kisinin rolu: {roleLabel[invite.assigned_role]}
            </p>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${invite.code}`}
                className="bg-background text-sm"
              />
              <Button
                size="icon"
                variant="secondary"
                onClick={copyCode}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-[hsl(var(--success))]" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Yeni bir davet kodu olustur.
            </p>
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">
                Davetle verilecek rol
              </Label>
              <Select
                value={assignedRole}
                onValueChange={(value) => setAssignedRole(value as MemberRole)}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Uye</SelectItem>
                  <SelectItem value="mod" disabled={!canAssign("mod")}>Moderator</SelectItem>
                  <SelectItem value="admin" disabled={!canAssign("admin")}>Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!canCreate && (
              <p className="text-xs text-destructive">
                Davet olusturma yetkin yok.
              </p>
            )}
            <Button
              onClick={createInvite}
              disabled={loading || !canCreate}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? "Olusturuluyor..." : "Davet Olustur"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

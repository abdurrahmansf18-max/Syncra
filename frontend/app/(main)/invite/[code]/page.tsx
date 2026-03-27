"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { api } from "@/lib/api"
import type { Invite } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { UserPlus, Loader2 } from "lucide-react"

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const code = params?.code as string
  const [invite, setInvite] = useState<Invite | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState("")

  const roleLabel = {
    member: "Uye",
    mod: "Moderator",
    admin: "Admin",
  } as const

  useEffect(() => {
    api
      .get<Invite>(`/invites/${code}`)
      .then(setInvite)
      .catch(() => setError("Davet bulunamadi veya suresi dolmus."))
      .finally(() => setLoading(false))
  }, [code])

  const handleJoin = async () => {
    setJoining(true)
    try {
      await api.post(`/invites/${code}/join`)
      if (invite) {
        router.push(`/servers/${invite.server_id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Katilma basarisiz")
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-secondary">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-secondary p-6">
      <div className="w-full max-w-sm rounded-lg bg-card p-8 text-center">
        {error ? (
          <>
            <p className="mb-4 text-sm text-destructive">{error}</p>
            <Button
              variant="secondary"
              onClick={() => router.push("/servers")}
            >
              Ana Sayfaya Don
            </Button>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">
              {invite?.server_name?.slice(0, 2).toUpperCase() || "?"}
            </div>
            <h2 className="mb-1 text-lg font-bold text-foreground">
              {invite?.server_name || "Sunucu"}
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Bu sunucuya davet edildin!
            </p>
            {invite?.assigned_role && (
              <p className="mb-4 text-xs text-muted-foreground">
                Katildiginda atanacak rol: {roleLabel[invite.assigned_role]}
              </p>
            )}
            <Button
              onClick={handleJoin}
              disabled={joining}
              className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <UserPlus className="h-4 w-4" />
              {joining ? "Katiliniyor..." : "Sunucuya Katil"}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

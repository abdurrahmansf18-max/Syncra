"use client"

import { useState } from "react"
import { api } from "@/lib/api"
import type { Report } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckCircle, XCircle } from "lucide-react"

interface Props {
  report: Report
  onUpdated: () => void
}

export function ReportItem({ report, onUpdated }: Props) {
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)

  const handleResolve = async (status: "reviewing" | "resolved" | "rejected") => {
    setLoading(true)
    try {
      await api.patch(`/reports/${report.id}`, {
        status,
        resolution_note: note || undefined,
      })
      onUpdated()
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const isActionable = report.status === "open" || report.status === "reviewing"

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <p className="mt-1 text-xs text-muted-foreground">
            Sikayet Eden: {report.reporter?.username || <span className="italic text-destructive">Hesabı silindi</span>}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sikayet Edilen: {report.reported_user?.username || "Bilinmeyen"}
          </p>
          <p className="mt-2 text-sm text-foreground/90">
            Mesaj: {report.message_content || "Mesaj içeriği bulunamadı"}
          </p>
          <p className="mt-1 text-sm text-foreground">
            Sebep: {report.reason || "Sebep belirtilmemis"}
          </p>
          {report.resolution_note && (
            <p className="mt-2 text-xs italic text-muted-foreground">
              Çözüm Notu: {report.resolution_note}
            </p>
          )}
        </div>
        <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {report.status}
        </span>
      </div>

      {isActionable && (
        <div className="mt-3 flex flex-col gap-2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Cozum notu (istege bagli)"
            className="bg-card text-sm"
          />
          <div className="flex gap-2">
            {report.status === "open" && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleResolve("reviewing")}
                disabled={loading}
                className="gap-1"
              >
                Incele
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => handleResolve("resolved")}
              disabled={loading}
              className="gap-1 bg-[hsl(var(--success))] text-primary-foreground"
            >
              <CheckCircle className="h-3 w-3" />
              Coz
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleResolve("rejected")}
              disabled={loading}
              className="gap-1"
            >
              <XCircle className="h-3 w-3" />
              Reddet
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

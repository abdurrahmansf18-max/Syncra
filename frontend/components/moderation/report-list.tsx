"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { Report, ReportStatus, MemberRole } from "@/lib/types"
import { ReportItem } from "./report-item"
import { Flag } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  serverId: string
  myRole: MemberRole
}

type ScopeTab = "reports" | "system"

const TABS: { value: ReportStatus; label: string }[] = [
  { value: "open", label: "Acik" },
  { value: "reviewing", label: "Inceleniyor" },
  { value: "resolved", label: "Cozuldu" },
  { value: "rejected", label: "Reddedildi" },
]

export function ReportList({ serverId, myRole }: Props) {
  const [reports, setReports] = useState<Report[]>([])
  const [scope, setScope] = useState<ScopeTab>(myRole === "member" ? "system" : "reports")
  const [activeTab, setActiveTab] = useState<ReportStatus>("open")
  const [loading, setLoading] = useState(true)
  const canModerateReports = myRole === "admin" || myRole === "mod"

  const fetchReports = () => {
    setLoading(true)
    const endpoint =
      scope === "system"
        ? `/servers/${serverId}/reports/system`
        : `/servers/${serverId}/reports?status_filter=${activeTab}`

    api
      .get<Report[]>(endpoint)
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchReports()
  }, [serverId, activeTab, scope])

  useEffect(() => {
    const onReportChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ server_id?: string }>
      if (customEvent.detail?.server_id === serverId) {
        fetchReports()
      }
    }

    window.addEventListener("reportChanged", onReportChanged as EventListener)
    return () => {
      window.removeEventListener("reportChanged", onReportChanged as EventListener)
    }
  }, [serverId, activeTab, scope])

  const filtered = reports

  const formatDateTime = (value?: string) => {
    if (!value) return "-"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "-"
    return date.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Flag className="h-5 w-5 text-destructive" />
        <h3 className="text-sm font-semibold text-foreground">
          {scope === "system" ? "Sistem Bildirimleri" : "Sikayetler"}
        </h3>
      </div>

      <div className="flex gap-1 rounded-lg bg-background p-1">
        {canModerateReports && (
          <button
            onClick={() => setScope("reports")}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              scope === "reports"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Sikayetler
          </button>
        )}
        <button
          onClick={() => setScope("system")}
          className={cn(
            "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            scope === "system"
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Sistem Bildirimleri
        </button>
      </div>

      {/* Tabs */}
      {scope === "reports" && canModerateReports && (
        <div className="flex gap-1 rounded-lg bg-background p-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                activeTab === tab.value
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Yukleniyor...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {scope === "system"
            ? "Sistem bildirimi bulunmuyor."
            : "Bu kategoride sikayet yok."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((r) =>
            scope === "system" ? (
              <div key={r.id} className="rounded-lg border border-border bg-background p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm text-foreground">
                    {r.resolution_note || r.message_content || "Sistem bildirimi"}
                  </p>
                  <span className="rounded bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {formatDateTime(r.created_at)}
                  </span>
                </div>
              </div>
            ) : (
              <ReportItem
                key={r.id}
                report={r}
                onUpdated={fetchReports}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}

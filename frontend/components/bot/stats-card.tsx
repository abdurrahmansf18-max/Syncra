"use client"

import type { Stats } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MessageSquare, Users, Mic } from "lucide-react"
import { BarChart3 } from "lucide-react"

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  stats: Stats | null
}

export function StatsCard({ open, onOpenChange, stats }: Props) {
  if (!stats) return null

  const items = [
    {
      label: "Toplam Mesaj",
      value: stats.total_messages,
      icon: MessageSquare,
      color: "text-primary",
    },
    {
      label: "Toplam Uye",
      value: stats.total_members,
      icon: Users,
      color: "text-[hsl(var(--success))]",
    },
    {
      label: "Aktif Ses Kullanicisi",
      value: stats.active_voice_users,
      icon: Mic,
      color: "text-[hsl(var(--warning))]",
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <BarChart3 className="h-5 w-5 text-primary" />
            Sunucu Istatistikleri
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-lg border border-border p-4"
              >
                <Icon className={`h-6 w-6 ${item.color}`} />
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {item.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

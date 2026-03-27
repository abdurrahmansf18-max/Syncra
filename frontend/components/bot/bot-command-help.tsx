"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Bot, Terminal } from "lucide-react"

interface BotHelpResponse {
  commands: { command: string; description: string; usage?: string }[]
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function BotCommandHelp({ open, onOpenChange }: Props) {
  const [commands, setCommands] = useState<
    { command: string; description: string; usage?: string }[]
  >([])

  useEffect(() => {
    if (open) {
      api
        .get<BotHelpResponse>("/bot/help")
        .then((data) => setCommands(data.commands || []))
        .catch(() => {
          setCommands([
            { command: "/help", description: "Bu yardim mesajini gosterir", usage: "/help" },
            { command: "/poll", description: "Yeni bir anket olusturur", usage: "/poll soru | secenek1 | secenek2" },
            { command: "/stats", description: "Sunucu istatistiklerini gosterir", usage: "/stats" },
          ])
        })
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Bot className="h-5 w-5 text-primary" />
            Bot Komutlari
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {commands.map((cmd) => (
            <div
              key={cmd.command}
              className="flex items-start gap-3 rounded-lg border border-border p-3"
            >
              <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="font-mono text-sm font-semibold text-foreground">
                  {cmd.command}
                </p>
                <p className="text-xs text-muted-foreground">
                  {cmd.description}
                </p>
                {cmd.usage && (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground/80">
                    {cmd.usage}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

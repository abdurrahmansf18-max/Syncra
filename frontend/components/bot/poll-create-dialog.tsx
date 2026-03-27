"use client"

import { useState } from "react"
import { api } from "@/lib/api"
import type { Poll } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, X, BarChart3 } from "lucide-react"

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  serverId: string
  channelId: string
}

export function PollCreateDialog({
  open,
  onOpenChange,
  serverId,
  channelId,
}: Props) {
  const [question, setQuestion] = useState("")
  const [options, setOptions] = useState(["", ""])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const addOption = () => {
    if (options.length < 6) setOptions([...options, ""])
  }

  const removeOption = (idx: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== idx))
    }
  }

  const updateOption = (idx: number, val: string) => {
    const copy = [...options]
    copy[idx] = val
    setOptions(copy)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const validOptions = options.filter((o) => o.trim())
    if (validOptions.length < 2) {
      setError("En az 2 secenk gerekli")
      return
    }
    setError("")
    setLoading(true)
    try {
      await api.post<Poll>("/bot/poll", {
        server_id: serverId,
        channel_id: channelId,
        question,
        options: validOptions,
      })
      window.dispatchEvent(new CustomEvent("pollCreated", { detail: { channelId } }))
      onOpenChange(false)
      setQuestion("")
      setOptions(["", ""])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Olusturulamadi")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <BarChart3 className="h-5 w-5 text-primary" />
            Anket Olustur
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Soru
            </Label>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Hangi dili tercih edersiniz?"
              required
              className="bg-background"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Secenekler
            </Label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  placeholder={`Secenek ${i + 1}`}
                  className="bg-background"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addOption}
                className="self-start text-muted-foreground"
              >
                <Plus className="mr-1 h-4 w-4" />
                Secenek Ekle
              </Button>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? "Olusturuluyor..." : "Anket Olustur"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { Poll } from "@/lib/types"
import { cn } from "@/lib/utils"
import { BarChart3, CheckCircle2 } from "lucide-react"

interface Props {
  poll: Poll
}

export function PollCard({ poll }: Props) {
  const [votedOption, setVotedOption] = useState<string | null>(poll.my_vote_option_id)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setVotedOption(poll.my_vote_option_id)
  }, [poll.my_vote_option_id])

  const handleVote = async (optionId: string) => {
    if (votedOption || poll.is_closed) return
    setError("")
    setLoading(true)
    try {
      await api.post(`/polls/${poll.id}/vote`, { option_id: optionId })
      setVotedOption(optionId)
      window.dispatchEvent(new CustomEvent("pollVoted", { detail: { channelId: poll.channel_id } }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Oy kullanilamadi")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="my-2 rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          Anket
        </span>
        {poll.is_closed && (
          <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
            Kapali
          </span>
        )}
      </div>
      <p className="mb-3 text-sm font-semibold text-foreground">
        {poll.question}
      </p>
      <p className="mb-2 text-xs text-muted-foreground">Toplam oy: {poll.total_votes}</p>
      <div className="flex flex-col gap-2">
        {poll.options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => handleVote(opt.id)}
            disabled={!!votedOption || poll.is_closed || loading}
            className={cn(
              "relative overflow-hidden flex items-center gap-2 rounded border border-border px-3 py-2 text-left text-sm transition-colors",
              votedOption === opt.id
                ? "border-primary bg-primary/10 text-primary"
                : "hover:bg-accent text-foreground"
            )}
          >
            <div
              className="absolute inset-y-0 left-0 bg-primary/15 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, opt.vote_percent || 0))}%` }}
            />
            {votedOption === opt.id ? (
              <CheckCircle2 className="relative z-[1] h-4 w-4 shrink-0 text-primary" />
            ) : (
              <div className="relative z-[1] h-4 w-4 shrink-0 rounded-full border border-muted-foreground" />
            )}
            <span className="relative z-[1] flex-1">{opt.label}</span>
            <span className="relative z-[1] text-xs text-muted-foreground">
              {opt.vote_count} oy (%{Math.round(opt.vote_percent || 0)})
            </span>
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  )
}

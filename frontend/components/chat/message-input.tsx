"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Message, Poll, Stats, Channel, MemberRole } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { Send, Lock, Smile, Bot } from "lucide-react";
import { BotCommandHelp } from "@/components/bot/bot-command-help";
import { PollCreateDialog } from "@/components/bot/poll-create-dialog";
import { StatsCard } from "@/components/bot/stats-card";
import { LIMITS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface Props {
  channelId: string;
  serverId: string;
  channelName: string;
  channel?: Channel;
}

import { EMOJI_SET } from "@/lib/emojis";

export function MessageInput({
  channelId,
  serverId,
  channelName,
  channel,
}: Props) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [commandError, setCommandError] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [userRole, setUserRole] = useState<MemberRole | null>(null);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const typingActiveRef = useRef(false);
  const lastActivityEmitRef = useRef(0);
  const { user } = useAuth();
  const canCreatePoll = userRole === "admin" || userRole === "mod";

  const emitTyping = (isTyping: boolean) => {
    const sendTyping = (window as any).__syncra_sendTyping as
      | ((isTyping: boolean) => void)
      | undefined;
    if (!sendTyping) return;
    sendTyping(isTyping);
  };

  const handleTypingSignal = (nextValue: string) => {
    if (!nextValue.trim()) {
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
      if (typingActiveRef.current) {
        emitTyping(false);
        typingActiveRef.current = false;
      }
      return;
    }

    if (!typingActiveRef.current) {
      emitTyping(true);
      typingActiveRef.current = true;
    }

    const now = Date.now();
    if (now - lastActivityEmitRef.current > 900) {
      window.dispatchEvent(new CustomEvent("chatActivity", { detail: { channelId } }));
      lastActivityEmitRef.current = now;
    }

    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
    }

    typingStopTimerRef.current = setTimeout(() => {
      emitTyping(false);
      typingActiveRef.current = false;
      typingStopTimerRef.current = null;
    }, 1300);
  };

  // Fetch user's role in the server
  useEffect(() => {
    if (!serverId || !user) return;
    api
      .get<any[]>(`/servers/${serverId}/members`)
      .then((members) => {
        const currentMember = members.find((m) => m.user_id === user.id);
        if (currentMember) {
          setUserRole(currentMember.role);
        }
      })
      .catch(() => {
        setUserRole(null);
      });
  }, [serverId, user]);

  // Check if user can post
  const canPost = () => {
    if (!channel || !userRole) return true; // Allow if no channel info or role info

    const roleHierarchy: Record<MemberRole, number> = {
      admin: 2,
      mod: 1,
      member: 0,
    };

    return roleHierarchy[userRole] >= roleHierarchy[channel.min_role_to_post];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || sending || !canPost()) return;
    setCommandError("");

    // Bot commands
    if (trimmed.startsWith("/")) {
      const cmd = trimmed.split(" ")[0].toLowerCase();
      if (cmd === "/help") {
        setShowHelp(true);
        setContent("");
        return;
      }
      if (cmd === "/poll") {
        if (userRole && !canCreatePoll) {
          setCommandError("Anket olusturma yetkiniz yok. (Moderator/Admin gerekli)");
          return;
        }

        const rawArgs = trimmed.slice(5).trim();
        if (rawArgs) {
          const parts = rawArgs
            .split("|")
            .map((p) => p.trim())
            .filter(Boolean);

          if (parts.length < 3) {
            setCommandError("/poll kullanimi: /poll soru | secenek1 | secenek2");
            return;
          }

          const [question, ...options] = parts;
          if (!question.trim()) {
            setCommandError("/poll icin soru bos olamaz.");
            return;
          }

          try {
            await api.post<Poll>("/bot/poll", {
              server_id: serverId,
              channel_id: channelId,
              question,
              options,
            });
            window.dispatchEvent(new CustomEvent("pollCreated", { detail: { channelId } }));
            setContent("");
          } catch (err) {
            setCommandError(err instanceof Error ? err.message : "Anket olusturulamadi");
          }
          return;
        }
        setShowPoll(true);
        setContent("");
        return;
      }
      if (cmd === "/stats") {
        try {
          const s = await api.get<Stats>(`/servers/${serverId}/stats`);
          setStats(s);
          setShowStats(true);
          setContent("");
        } catch {
          setCommandError("Istatistikler su an alinamiyor.");
        }
        return;
      }

      setCommandError("Bilinmeyen komut. /help yazarak komutlari gorebilirsin.");
      return;
    }

    setSending(true);
    try {
      const msg = await api.post<Message>(`/channels/${channelId}/messages`, {
        content: trimmed,
      });
      setContent("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      emitTyping(false);
      typingActiveRef.current = false;
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }

      // Optimistic update: add message to UI immediately
      const addMessage = (window as any).__syncra_addMessage as
        | ((msg: Message) => void)
        | undefined;
      if (addMessage && msg) {
        addMessage(msg);
      }
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    return () => {
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
      }
      if (typingActiveRef.current) {
        emitTyping(false);
        typingActiveRef.current = false;
      }
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!showEmojiPicker) return;
      const target = event.target as Node;
      if (
        emojiPickerRef.current?.contains(target) ||
        emojiButtonRef.current?.contains(target)
      ) {
        return;
      }
      setShowEmojiPicker(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [showEmojiPicker]);

  const handleInsertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;

    if (!textarea) {
      const nextValue = `${content}${emoji}`;
      setContent(nextValue);
      handleTypingSignal(nextValue);
      setShowEmojiPicker(false);
      return;
    }

    const selectionStart = textarea.selectionStart ?? content.length;
    const selectionEnd = textarea.selectionEnd ?? content.length;

    const nextValue =
      content.slice(0, selectionStart) +
      emoji +
      content.slice(selectionEnd);

    setContent(nextValue);
    handleTypingSignal(nextValue);
    setShowEmojiPicker(false);

    requestAnimationFrame(() => {
      textarea.focus();
      const nextCaret = selectionStart + emoji.length;
      textarea.setSelectionRange(nextCaret, nextCaret);
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Mobilde (dokunmatik ekranlarda) Enter tuşu genellikle yeni satır ekler
    // Masaüstünde Enter gönderir, Shift+Enter yeni satır ekler.
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 z-30 bg-background/95 px-4 pb-4 pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      >
        <div className="relative flex items-end gap-2 rounded-2xl bg-muted/50 p-2 pr-3 shadow-sm ring-1 ring-border/50 transition-all focus-within:bg-muted focus-within:ring-2 focus-within:ring-primary/30">
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted-foreground/10 hover:text-foreground"
            title="Bot Komutlari"
          >
             <Bot className="h-5 w-5" />
          </button>

          <textarea
            ref={textareaRef}
            value={content}
            maxLength={LIMITS.MAX_MESSAGE_LENGTH}
            onChange={(e) => {
              const nextValue = e.target.value;
              if (nextValue.length > LIMITS.MAX_MESSAGE_LENGTH) return;
              
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${Math.min(target.scrollHeight, 208)}px`; // Max-height (13rem) to stop growth
              
              setContent(nextValue);
              handleTypingSignal(nextValue);
            }}
            onKeyDown={handleKeyDown}
            placeholder={`#${channelName} kanalina mesaj gonder`}
            rows={1}
            className="max-h-52 min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 outline-none scrollbar-thin scrollbar-thumb-muted-foreground/20"
          />
          
          <div className="relative mb-0.5 ml-1 flex items-center gap-1.5 sm:ml-2">
             <span className={cn(
               "text-[10px] tabular-nums select-none transition-colors min-w-[3ch] text-right",
               content.length >= LIMITS.MAX_MESSAGE_LENGTH ? "text-red-500 font-bold" : "text-muted-foreground/60"
             )}>
                {content.length}/{LIMITS.MAX_MESSAGE_LENGTH}
             </span>
             
             <div className="relative">
                <button
                  ref={emojiButtonRef}
                  type="button"
                  onClick={() => setShowEmojiPicker((prev) => !prev)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted-foreground/10 hover:text-foreground"
                  aria-label="Emoji sec"
                >
                  <Smile className="h-5 w-5" />
                </button>
                {showEmojiPicker && (
                  <div
                    ref={emojiPickerRef}
                    className="absolute bottom-full right-0 z-50 mb-4 w-72 max-w-[85vw] overflow-hidden rounded-xl border border-border bg-popover p-0 shadow-xl animate-in fade-in slide-in-from-bottom-2"
                  >
                    <div className="border-b border-border bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground flex justify-between items-center">
                      <span>Emoji Sec</span>
                      <span className="text-[10px] opacity-70">{EMOJI_SET.length} emoji</span>
                    </div>
                    <div className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto p-2 scrollbar-thin">
                      {EMOJI_SET.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleInsertEmoji(emoji)}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-xl transition hover:bg-accent hover:scale-110"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
             </div>

            <button
              type="submit"
              disabled={!content.trim() || sending || !canPost()}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
              title={!canPost() ? "Yazma izniniz yok" : "Gonder"}
            >
              {!canPost() ? (
                <Lock className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4 ml-0.5" />
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Helper components that were previously inline or near */}
      <BotCommandHelp
        open={showHelp}
        onOpenChange={setShowHelp}
      />
      <PollCreateDialog
        open={showPoll}
        onOpenChange={setShowPoll}
        serverId={serverId}
        channelId={channelId}
      />
      <StatsCard open={showStats} onOpenChange={setShowStats} stats={stats} />
    </>
  );
}

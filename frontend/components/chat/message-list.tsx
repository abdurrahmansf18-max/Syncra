"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { Message, Poll, MemberRole, Membership } from "@/lib/types";
import { MessageItem } from "./message-item";
import { WS_BASE_URL } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { PollCard } from "@/components/bot/poll-card";

interface Props {
  channelId: string;
  serverId: string;
}

export function MessageList({ channelId, serverId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [hasUnseenMessages, setHasUnseenMessages] = useState(false);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepAliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRotationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const lastPongAtRef = useRef<number>(Date.now());
  const lastActivitySyncAtRef = useRef<number>(0);
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const isNearBottomRef = useRef(true);
  const { token, user } = useAuth();
  const [myRole, setMyRole] = useState<MemberRole | undefined>(undefined);

  // Fetch current user role in this server
  useEffect(() => {
    if (!serverId || !user) return;
    
    api
      .get<Membership>(`/servers/${serverId}/members/${user.id}`)
      .then((member) => {
         setMyRole(member.role);
      })
      .catch(() => {
         // Maybe user is not a member or error, default to undefined (no special powers)
      });
  }, [serverId, user]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
    isNearBottomRef.current = true;
    setHasUnseenMessages(false);
  }, []);

  const updateNearBottomState = useCallback(() => {
    const container = listRef.current;
    if (!container) return;
    const remainingDistance =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = remainingDistance <= 120;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) {
      setHasUnseenMessages(false);
    }
  }, []);

  useEffect(() => {
    setHasUnseenMessages(false);
    isNearBottomRef.current = true;
  }, [channelId]);

  // Fetch initial messages
  useEffect(() => {
    setLoading(true);
    api
      .get<Message[]>(`/channels/${channelId}/messages`)
      .then((data) => {
        setMessages(data);
        setLoading(false);
        setTimeout(() => scrollToBottom("auto"), 100);
      })
      .catch(() => setLoading(false));
  }, [channelId, scrollToBottom]);

  useEffect(() => {
    api
      .get<Poll[]>(`/channels/${channelId}/polls`)
      .then(setPolls)
      .catch(() => setPolls([]));
  }, [channelId]);

  useEffect(() => {
    const handlePollCreated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const createdChannelId = customEvent.detail?.channelId;
      if (createdChannelId !== channelId) return;

      api
        .get<Poll[]>(`/channels/${channelId}/polls`)
        .then(setPolls)
        .catch(() => {});
    };

    window.addEventListener("pollCreated", handlePollCreated);
    const handlePollVoted = (event: Event) => {
      const customEvent = event as CustomEvent;
      const votedChannelId = customEvent.detail?.channelId;
      if (votedChannelId !== channelId) return;

      api
        .get<Poll[]>(`/channels/${channelId}/polls`)
        .then(setPolls)
        .catch(() => {});
    };

    window.addEventListener("pollVoted", handlePollVoted);
    return () => {
      window.removeEventListener("pollCreated", handlePollCreated);
      window.removeEventListener("pollVoted", handlePollVoted);
    };
  }, [channelId]);

  // WebSocket for real-time messages
  useEffect(() => {
    if (!token) return;

    shouldReconnectRef.current = true;

    const clearKeepAlive = () => {
      if (keepAliveTimerRef.current) {
        clearInterval(keepAliveTimerRef.current);
        keepAliveTimerRef.current = null;
      }
      if (wsRotationTimerRef.current) {
        clearInterval(wsRotationTimerRef.current);
        wsRotationTimerRef.current = null;
      }
    };

    const clearReconnect = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const forceReconnect = () => {
      const activeSocket = wsRef.current;
      if (!activeSocket) {
        return;
      }
      if (activeSocket.readyState === WebSocket.OPEN || activeSocket.readyState === WebSocket.CONNECTING) {
        activeSocket.close();
      }
    };

    const syncMessages = () => {
      api
        .get<Message[]>(`/channels/${channelId}/messages`)
        .then((serverMessages) => {
          setMessages((prev) => {
            if (prev.length === serverMessages.length) {
              const prevLast = prev[prev.length - 1];
              const nextLast = serverMessages[serverMessages.length - 1];
              if (
                (!prevLast && !nextLast) ||
                (prevLast && nextLast && prevLast.id === nextLast.id && prevLast.is_deleted === nextLast.is_deleted)
              ) {
                return prev;
              }
            }
            return serverMessages;
          });
        })
        .catch(() => {});
    };

    const connectSocket = () => {
      const ws = new WebSocket(
        `${WS_BASE_URL}/ws/channel/${channelId}?token=${encodeURIComponent(token)}`,
      );
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        lastPongAtRef.current = Date.now();

        api
          .get<Message[]>(`/channels/${channelId}/messages`)
          .then(setMessages)
          .catch(() => {});

        clearKeepAlive();
        keepAliveTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            if (Date.now() - lastPongAtRef.current > 65000) {
              ws.close();
              return;
            }
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);

        wsRotationTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        }, 4 * 60 * 1000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const incoming = data?.data || data?.message;
          if (data.type === "text" && incoming?.id) {
            setMessages((prev) => {
              if (prev.some((item) => item.id === incoming.id)) {
                return prev;
              }
              return [...prev, incoming];
            });
            if (isNearBottomRef.current) {
              setTimeout(() => scrollToBottom("smooth"), 50);
            } else {
              setHasUnseenMessages(true);
            }
          }

          if (data.type === "message_deleted" && incoming?.id) {
            setMessages((prev) =>
              prev.map((item) =>
                item.id === incoming.id ? { ...item, is_deleted: true } : item,
              ),
            );
          }

          if (data.type === "typing" && incoming?.user_id) {
            if (incoming.user_id === user?.id) return;

            const targetUserId = String(incoming.user_id);
            const targetUsername = String(incoming.username || "Biri");
            const isTyping = Boolean(incoming.is_typing);

            if (typingTimersRef.current[targetUserId]) {
              clearTimeout(typingTimersRef.current[targetUserId]);
              delete typingTimersRef.current[targetUserId];
            }

            if (isTyping) {
              setTypingUsers((prev) => ({ ...prev, [targetUserId]: targetUsername }));

              typingTimersRef.current[targetUserId] = setTimeout(() => {
                setTypingUsers((prev) => {
                  const next = { ...prev };
                  delete next[targetUserId];
                  return next;
                });
                delete typingTimersRef.current[targetUserId];
              }, 3200);
            } else {
              setTypingUsers((prev) => {
                const next = { ...prev };
                delete next[targetUserId];
                return next;
              });
            }
          }

          if (data.type === "pong") {
            lastPongAtRef.current = Date.now();
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onclose = (event) => {
        if (event.code === 4001) {
          shouldReconnectRef.current = false;
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("auth:unauthorized"));
          }
          return;
        }

        clearKeepAlive();
        wsRef.current = null;

        if (!shouldReconnectRef.current) {
          return;
        }

        const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 8000);
        reconnectAttemptRef.current += 1;
        clearReconnect();
        reconnectTimerRef.current = setTimeout(() => {
          connectSocket();
        }, delay);
      };
    };

    connectSocket();

    syncTimerRef.current = setInterval(syncMessages, 3000);

    const handleOnline = () => {
      forceReconnect();
      syncMessages();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        forceReconnect();
        syncMessages();
      }
    };

    const handleChatActivity = (event: Event) => {
      const customEvent = event as CustomEvent;
      const targetChannelId = customEvent.detail?.channelId;
      if (targetChannelId !== channelId) {
        return;
      }

      const now = Date.now();
      if (now - lastActivitySyncAtRef.current < 1200) {
        return;
      }
      lastActivitySyncAtRef.current = now;

      const activeSocket = wsRef.current;
      if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
        forceReconnect();
      }
      syncMessages();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("chatActivity", handleChatActivity);

    (window as any).__syncra_sendTyping = (isTyping: boolean) => {
      const activeSocket = wsRef.current;
      if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
      activeSocket.send(JSON.stringify({ type: "typing", is_typing: isTyping }));
    };

    return () => {
      shouldReconnectRef.current = false;
      clearReconnect();
      clearKeepAlive();
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      Object.values(typingTimersRef.current).forEach((timerId) => {
        clearTimeout(timerId);
      });
      typingTimersRef.current = {};
      setTypingUsers({});
      delete (window as any).__syncra_sendTyping;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("chatActivity", handleChatActivity);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [channelId, token, scrollToBottom, user]);

  // Expose addMessage for local optimistic updates
  const addMessage = useCallback(
    (msg: Message) => {
      setMessages((prev) => {
        if (prev.some((item) => item.id === msg.id)) {
          return prev;
        }
        return [...prev, msg];
      });
      setTimeout(() => scrollToBottom("smooth"), 50);
    },
    [scrollToBottom],
  );

  // Store addMessage in a ref so MessageInput can use it
  useEffect(() => {
    (window as any).__syncra_addMessage = addMessage;
    return () => {
      delete (window as any).__syncra_addMessage;
    };
  }, [addMessage]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const typingNames = Object.values(typingUsers);
  const typingText =
    typingNames.length === 1
      ? `${typingNames[0]} yaziyor`
      : `${typingNames.length} kisi yaziyor`;

  return (
    <div
      ref={listRef}
      onScroll={updateNearBottomState}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-background px-2 py-2 pb-32 sm:px-4 sm:py-4 sm:pb-4 md:pb-4 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
    >
      {polls.length > 0 && (
        <div className="mb-2">
          {polls.map((poll) => (
            <PollCard key={poll.id} poll={poll} />
          ))}
        </div>
      )}

      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
          <p className="text-base sm:text-lg font-medium">
            Burasi bos gorunuyor
          </p>
          <p className="text-xs sm:text-sm">Ilk mesaji sen gonder!</p>
        </div>
      ) : (
        messages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            serverId={serverId}
            myRole={myRole}
            onDeleted={(messageId) => {
              setMessages((prev) =>
                prev.map((item) =>
                  item.id === messageId ? { ...item, is_deleted: true } : item,
                ),
              );
            }}
          />
        ))
      )}

      {hasUnseenMessages && (
        <div className="sticky bottom-3 z-20 ml-auto">
          <button
            type="button"
            onClick={() => scrollToBottom("smooth")}
            className="rounded-full border border-border bg-card/95 px-3 py-1 text-xs font-medium text-foreground shadow-sm transition hover:bg-accent"
          >
            Yeni mesajlar • Alta in
          </button>
        </div>
      )}

      {typingNames.length > 0 && (
        <div className="sticky bottom-1 z-10 mt-2 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1 text-xs text-foreground shadow-sm">
          <span>{typingText}</span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/80" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/80" style={{ animationDelay: "120ms" }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/80" style={{ animationDelay: "240ms" }} />
          </span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

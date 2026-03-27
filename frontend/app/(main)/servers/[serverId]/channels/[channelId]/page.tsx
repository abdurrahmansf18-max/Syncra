"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Channel } from "@/lib/types";
import { MessageList } from "@/components/chat/message-list";
import { MessageInput } from "@/components/chat/message-input";
import { VoiceRoom } from "@/components/voice/voice-room";
import { Hash, Volume2 } from "lucide-react";

export default function ChannelPage() {
  const params = useParams();
  const channelId = params?.channelId as string;
  const serverId = params?.serverId as string;
  const [channel, setChannel] = useState<Channel | null>(null);

  useEffect(() => {
    if (!serverId) return;
    api
      .get<Channel[]>(`/servers/${serverId}/channels`)
      .then((channels) => {
        const ch = channels.find((c) => c.id === channelId);
        if (ch) setChannel(ch);
      })
      .catch(() => {});
  }, [serverId, channelId]);

  if (!channel) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Channel Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/50 px-4 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          {channel.type === "text" ? (
            <Hash className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Volume2 className="h-5 w-5 text-muted-foreground" />
          )}
          <h2 className="text-[17px] font-bold text-foreground truncate tracking-tight">
            {channel.name}
          </h2>
          {channel.description && (
             <>
               <span className="hidden h-4 w-[1px] bg-border md:block" />
               <p className="hidden truncate text-sm text-muted-foreground md:block">
                 {channel.description}
               </p>
             </>
          )}
        </div>
      </header>

      {/* Content */}
      {channel.type === "text" ? (
        <>
          <MessageList channelId={channelId} serverId={serverId} />
          <MessageInput
            channelId={channelId}
            serverId={serverId}
            channelName={channel.name}
            channel={channel}
          />
        </>
      ) : (
        <VoiceRoom channelId={channelId} channelName={channel.name} />
      )}
    </div>
  );
}

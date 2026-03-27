"use client";
 
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Channel } from "@/lib/types";
import { Hash } from "lucide-react";
import { BanAlert } from "@/components/server/ban-alert";
 
export default function ServerIndexPage() {
  const params = useParams();
  const router = useRouter();
  const serverId = params?.serverId as string;
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banInfo, setBanInfo] = useState<{ reason: string } | null>(null);
 
  useEffect(() => {
    if (!serverId) return;
    api
      .get<Channel[]>(`/servers/${serverId}/channels`)
      .then((channels) => {
        const first = channels.find((c) => c.type === "text");
        if (first) {
          router.replace(`/servers/${serverId}/channels/${first.id}`);
        } else {
          setTried(true);
        }
      })
      .catch((err) => {
        const message = err?.message || "Erişim reddedildi";
        setError(message);
        setTried(true);
      });
  }, [serverId, router]);
 
  if (error) {
    // Ban sebebini ayır
    const parts = error.split("Sebep: ");
    const mainMessage = parts[0].trim();
    const reason = parts[1] || undefined;
 
    return (
      <BanAlert
        title="Erişim Reddedildi"
        message={mainMessage}
        reason={reason}
        onReturn={() => router.push("/servers")}
      />
    );
  }
 
  if (!tried) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
 
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground p-4 text-center">
      <Hash className="h-12 w-12 opacity-30" />
      <p className="text-lg font-medium">Henuz kanal yok</p>
      <p className="text-sm">Baslangic icin bir metin kanali olustur.</p>
    </div>
  );
}
 
 
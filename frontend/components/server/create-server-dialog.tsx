"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Server } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LIMITS } from "@/lib/constants";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}

export function CreateServerDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const normalizeHandle = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");

  const handleCopy = async () => {
    const normalized = normalizeHandle(handle);
    if (!normalized) return;
    try {
      await navigator.clipboard.writeText(`#${normalized}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const server = await api.post<Server>("/servers", {
        name,
        handle: handle.trim() ? normalizeHandle(handle) : undefined,
        is_published: false,
      });
      onCreated();
      onOpenChange(false);
      setName("");
      setHandle("");
      // Notify ServerList to refresh
      window.dispatchEvent(new CustomEvent("serverUpdated"));
      router.push(`/servers/${server.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Olusturulamadi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-foreground">
            Sunucunu Olustur
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">
            Limit: Kullanıcı başına en fazla {LIMITS.MAX_OWNED_SERVERS_PER_USER} sahip olunan sunucu ve en fazla {LIMITS.MAX_JOINED_SERVERS_PER_USER} katılınan sunucu.
          </p>
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Sunucu Adi
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Yeni sunucum"
              required
              minLength={3}
              maxLength={10}
              className="bg-background"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Handle (Opsiyonel)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                value={handle}
                onChange={(e) => setHandle(normalizeHandle(e.target.value))}
                placeholder="oyun-7f3a"
                minLength={3}
                maxLength={40}
                className="bg-background"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleCopy}
                disabled={!normalizeHandle(handle)}
                className="shrink-0"
              >
                {copied ? "Kopyalandi" : "Kopyala"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Boş bırakırsan otomatik üretilir. Sadece küçük harf, rakam ve tire.
            </p>
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? "Olusturuluyor..." : "Olustur"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

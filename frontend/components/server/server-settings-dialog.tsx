"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Server, MemberRole, ServerLimitUsage } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  server: Server;
  onUpdated: (s: Server) => void;
  onDeleted?: () => void;
}

export function ServerSettingsDialog({
  open,
  onOpenChange,
  server,
  onUpdated,
  onDeleted,
}: Props) {
  const [name, setName] = useState(server.name);
  const [handle, setHandle] = useState(server.handle || "");
  const [copied, setCopied] = useState(false);
  const [isPublished, setIsPublished] = useState(server.is_published);
  const [inviteMinRole, setInviteMinRole] = useState<MemberRole>(
    server.invite_min_role || "member",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [limitUsage, setLimitUsage] = useState<ServerLimitUsage | null>(null);
  const [limitLoading, setLimitLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    setName(server.name);
    setHandle(server.handle || "");
    setIsPublished(server.is_published);
    setInviteMinRole(server.invite_min_role || "member");
  }, [open, server]);

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

  useEffect(() => {
    if (!open) return;

    const loadUsage = () => {
      setLimitLoading(true);
      api
        .get<ServerLimitUsage>(`/servers/${server.id}/limits/usage`)
        .then(setLimitUsage)
        .catch(() => setLimitUsage(null))
        .finally(() => setLimitLoading(false));
    };

    loadUsage();
    const intervalId = setInterval(loadUsage, 5000);
    return () => clearInterval(intervalId);
  }, [open, server.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const updated = await api.patch<Server>(`/servers/${server.id}`, {
        name,
        handle: normalizeHandle(handle),
        is_published: isPublished,
        invite_min_role: inviteMinRole,
      });
      onUpdated(updated);
      onOpenChange(false);
      // Notify ServerList to refresh
      window.dispatchEvent(new CustomEvent("serverUpdated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Guncellenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setError("");
    setDeleteLoading(true);
    try {
      await api.delete(`/servers/${server.id}`);
      setShowDeleteConfirm(false);
      onOpenChange(false);
      onDeleted?.();
      // Notify ServerList to refresh
      window.dispatchEvent(new CustomEvent("serverUpdated"));
      router.push("/servers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Sunucu Ayarlari
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">
                Sunucu Adi
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-background"
                minLength={3}
                maxLength={10}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">
                Handle
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  value={handle}
                  onChange={(e) => setHandle(normalizeHandle(e.target.value))}
                  className="bg-background"
                  minLength={3}
                  maxLength={40}
                  required
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
                Bu değer keşfet ve arama tarafında benzersiz kimlik gibi görünür.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsPublished(!isPublished)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  isPublished
                    ? "bg-[hsl(var(--success))]"
                    : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-foreground transition-transform ${
                    isPublished ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <Label className="text-sm text-foreground">
                Herkese Acik (Kesfet&apos;te gorunsun)
              </Label>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">
                Davet olusturma yetkisi
              </Label>
              <Select
                value={inviteMinRole}
                onValueChange={(value) => setInviteMinRole(value as MemberRole)}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Sadece Admin</SelectItem>
                  <SelectItem value="mod">Admin + Moderator</SelectItem>
                  <SelectItem value="member">Admin + Moderator + Uye</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-border bg-background p-3">
              <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">
                Canli Limit Sayaclari
              </p>
              {limitLoading ? (
                <p className="text-xs text-muted-foreground">Yukleniyor...</p>
              ) : !limitUsage ? (
                <p className="text-xs text-muted-foreground">Sayac verisi alinamadi.</p>
              ) : (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    Metin Kanal: {limitUsage.usage.text_channels}/{limitUsage.limits.max_text_channels}
                  </p>
                  <p>
                    Ses Kanal: {limitUsage.usage.voice_channels}/{limitUsage.limits.max_voice_channels}
                  </p>
                  <p>
                    Aktif Metin Baglanti: {limitUsage.usage.active_text_ws_connections} (kanal basi max {limitUsage.limits.max_text_channel_connections})
                  </p>
                  <p>
                    Aktif Ses Baglanti: {limitUsage.usage.active_voice_ws_connections} (kanal basi max {limitUsage.limits.max_voice_channel_users})
                  </p>
                  <p>Ses Odasi Anlik Kisi: {limitUsage.usage.active_voice_presence}</p>
                  <p>Toplam Uye: {limitUsage.usage.members}</p>
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? "Kaydediliyor..." : "Kaydet"}
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowDeleteConfirm(true)}
              className="border border-destructive text-destructive hover:bg-destructive/10"
            >
              Sunucuyu Sil
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Emin misin?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Bu sunucuyu silmek geri alinamaz. Devam etmek istiyor musun?
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Vazgec
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading ? "Siliniyor..." : "Evet, Sil"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

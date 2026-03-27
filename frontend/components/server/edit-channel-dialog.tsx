"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Channel, Category, MemberRole } from "@/lib/types";
import { Hash, Volume2 } from "lucide-react";
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
  serverId: string;
  channels: Channel[];
  categories: Category[];
  selectedChannelIdFromParent?: string;
  onUpdated: () => void;
}

export function EditChannelDialog({
  open,
  onOpenChange,
  serverId,
  channels,
  categories,
  selectedChannelIdFromParent,
  onUpdated,
}: Props) {
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [name, setName] = useState("");
  const [minView, setMinView] = useState<MemberRole>("member");
  const [minPost, setMinPost] = useState<MemberRole>("member");
  const [categoryId, setCategoryId] = useState<string>("__none__");
  const [isPublished, setIsPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const selectedChannel = useMemo(
    () => channels.find((ch) => ch.id === selectedChannelId),
    [channels, selectedChannelId],
  );

  useEffect(() => {
    if (!open) return;
    const targetId =
      selectedChannelIdFromParent ||
      (channels.length > 0 ? channels[0].id : "");
    if (targetId) {
      setSelectedChannelId(targetId);
      const target = channels.find((ch) => ch.id === targetId);
      if (target) {
        setName(target.name);
        setMinView(target.min_role_to_view);
        setMinPost(target.min_role_to_post);
        setCategoryId(target.category_id || "__none__");
        setIsPublished(target.is_published);
      }
    } else {
      setSelectedChannelId("");
      setName("");
      setIsPublished(false);
      setError("");
    }
  }, [open, channels, selectedChannelIdFromParent]);

  const syncFromChannel = (channelId: string) => {
    setSelectedChannelId(channelId);
    const current = channels.find((ch) => ch.id === channelId);
    if (!current) return;
    setName(current.name);
    setMinView(current.min_role_to_view);
    setMinPost(current.min_role_to_post);
    setCategoryId(current.category_id || "__none__");
    setIsPublished(current.is_published);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChannelId) {
      setError("Düzenlemek için kanal seçin.");
      return;
    }

    setError("");
    setSaving(true);
    try {
      await api.patch(`/servers/${serverId}/channels/${selectedChannelId}`, {
        name,
        min_role_to_view: minView,
        min_role_to_post: minPost,
        category_id: categoryId === "__none__" ? null : categoryId,
      });
      await api.patch(
        `/servers/${serverId}/channels/${selectedChannelId}/publish`,
        {
          is_published: isPublished,
        },
      );
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kanal güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedChannelId) {
      setError("Silmek için kanal seçin.");
      return;
    }

    setError("");
    setDeleting(true);
    try {
      await api.delete(`/servers/${serverId}/channels/${selectedChannelId}`);
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kanal silinemedi");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Kanal Düzenle / Sil
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Kanal
            </Label>
            <div className="rounded-lg bg-primary/10 px-4 py-2 text-base font-semibold text-primary border border-primary/30 flex items-center gap-2">
              {selectedChannel?.type === "voice" ? (
                <Volume2 className="h-5 w-5" />
              ) : (
                <Hash className="h-5 w-5" />
              )}
              <span>{name}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Kanal Adı
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={3}
                maxLength={10}
              disabled={!selectedChannel}
              className="bg-background"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Kategori (Opsiyonel)
            </Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger
                className="bg-background"
                disabled={!selectedChannel}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Kategorisiz</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedChannel?.type === "voice" ? (
            <>
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">
                  Katılma İzni
                </Label>
                <Select
                  value={minView}
                  onValueChange={(v) => setMinView(v as MemberRole)}
                >
                  <SelectTrigger
                    className="bg-background"
                    disabled={!selectedChannel}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Herkes</SelectItem>
                    <SelectItem value="mod">Moderator+</SelectItem>
                    <SelectItem value="admin">Sadece Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPublished(!isPublished)}
                  disabled={!selectedChannel}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    isPublished
                      ? "bg-[hsl(var(--success))]"
                      : "bg-muted-foreground/30"
                  } ${!selectedChannel ? "opacity-50" : ""}`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-foreground transition-transform ${
                      isPublished ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <Label className="text-sm text-foreground">
                  Kanalı Yayınla
                </Label>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">
                  Görüntüleme İzni
                </Label>
                <Select
                  value={minView}
                  onValueChange={(v) => setMinView(v as MemberRole)}
                >
                  <SelectTrigger
                    className="bg-background"
                    disabled={!selectedChannel}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Herkes</SelectItem>
                    <SelectItem value="mod">Moderator+</SelectItem>
                    <SelectItem value="admin">Sadece Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">
                  Yazma İzni
                </Label>
                <Select
                  value={minPost}
                  onValueChange={(v) => setMinPost(v as MemberRole)}
                >
                  <SelectTrigger
                    className="bg-background"
                    disabled={!selectedChannel}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Herkes</SelectItem>
                    <SelectItem value="mod">Moderator+</SelectItem>
                    <SelectItem value="admin">Sadece Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPublished(!isPublished)}
                  disabled={!selectedChannel}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    isPublished
                      ? "bg-[hsl(var(--success))]"
                      : "bg-muted-foreground/30"
                  } ${!selectedChannel ? "opacity-50" : ""}`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-foreground transition-transform ${
                      isPublished ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <Label className="text-sm text-foreground">
                  Kanalı Yayınla
                </Label>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={deleting || !selectedChannel}
              onClick={handleDelete}
            >
              {deleting ? "Siliniyor..." : "Kanali Sil"}
            </Button>
            <Button
              type="submit"
              disabled={saving || !selectedChannel}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? "Kaydediliyor..." : "Degisiklikleri Kaydet"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

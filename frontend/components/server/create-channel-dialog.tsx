"use client";

import { useState } from "react";
import { api } from "@/lib/api";
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
import type { Category, ChannelType, MemberRole } from "@/lib/types";
import { LIMITS } from "@/lib/constants";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  serverId: string;
  categories: Category[];
  onCreated: () => void;
}

export function CreateChannelDialog({
  open,
  onOpenChange,
  serverId,
  categories,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ChannelType>("text");
  const [categoryId, setCategoryId] = useState<string>("__none__");
  const [minView, setMinView] = useState<MemberRole>("member");
  const [minPost, setMinPost] = useState<MemberRole>("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post(`/servers/${serverId}/channels`, {
        name,
        type,
        category_id: categoryId === "__none__" ? null : categoryId,
        min_role_to_view: minView,
        min_role_to_post: minPost,
      });
      onCreated();
      onOpenChange(false);
      setName("");
      setCategoryId("__none__");
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
          <DialogTitle className="text-foreground">Kanal Olustur</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">
            Limit: Metin kanalı en fazla {LIMITS.MAX_TEXT_CHANNELS_PER_SERVER}, sesli kanal en fazla {LIMITS.MAX_VOICE_CHANNELS_PER_SERVER}.
          </p>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Kanal Adi
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="genel"
              required
              minLength={3}
                maxLength={10}
              className="bg-background"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Kanal Turu
            </Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as ChannelType)}
            >
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Metin Kanali</SelectItem>
                <SelectItem value="voice">Ses Kanali</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Kategori (Opsiyonel)
            </Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="bg-background">
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

          {type === "voice" ? (
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">
                Katilma Izni
              </Label>
              <Select
                value={minView}
                onValueChange={(v) => setMinView(v as MemberRole)}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Herkes</SelectItem>
                  <SelectItem value="mod">Moderator+</SelectItem>
                  <SelectItem value="admin">Sadece Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">
                  Goruntuleme Izni
                </Label>
                <Select
                  value={minView}
                  onValueChange={(v) => setMinView(v as MemberRole)}
                >
                  <SelectTrigger className="bg-background">
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
                  Yazma Izni
                </Label>
                <Select
                  value={minPost}
                  onValueChange={(v) => setMinPost(v as MemberRole)}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Herkes</SelectItem>
                    <SelectItem value="mod">Moderator+</SelectItem>
                    <SelectItem value="admin">Sadece Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? "Olusturuluyor..." : "Kanal Olustur"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

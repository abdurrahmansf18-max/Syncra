"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Category } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  serverId: string;
  onCreated: (category: Category) => void;
}

export function CreateCategoryDialog({
  open,
  onOpenChange,
  serverId,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const created = await api.post<Category>(
        `/servers/${serverId}/categories`,
        {
          name,
          position: Number(position) || 0,
          is_published: true,
        },
      );
      onCreated(created);
      onOpenChange(false);
      setName("");
      setPosition("0");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategori oluşturulamadı");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Kategori Oluştur
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Kategori Adı
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Genel"
              required
              minLength={3}
                maxLength={10}
              className="bg-background"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? "Oluşturuluyor..." : "Kategori Oluştur"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

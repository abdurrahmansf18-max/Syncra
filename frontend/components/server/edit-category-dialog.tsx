"use client";

import { useMemo, useState, useEffect } from "react";
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
  categories: Category[];
  selectedCategoryIdFromParent?: string;
  onChanged: () => void;
}

export function EditCategoryDialog({
  open,
  onOpenChange,
  serverId,
  categories,
  selectedCategoryIdFromParent,
  onChanged,
}: Props) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [name, setName] = useState("");
  const [position, setPosition] = useState("0");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId),
    [categories, selectedCategoryId],
  );

  useEffect(() => {
    if (!open) return;
    const targetId =
      selectedCategoryIdFromParent ||
      (categories.length > 0 ? categories[0].id : "");
    if (targetId) {
      setSelectedCategoryId(targetId);
      const target = categories.find((c) => c.id === targetId);
      if (target) {
        setName(target.name);
        setPosition(String(target.position));
      }
    } else {
      setSelectedCategoryId("");
      setName("");
      setPosition("0");
    }
  }, [open, categories, selectedCategoryIdFromParent]);

  const onSelectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    const current = categories.find((c) => c.id === categoryId);
    if (current) {
      setName(current.name);
      setPosition(String(current.position));
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryId) {
      setError("Düzenlemek için kategori seçin.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const updated = await api.patch<Category>(
        `/servers/${serverId}/categories/${selectedCategoryId}`,
        {
          name,
          position: Number(position) || 0,
        },
      );
      void updated;
      onChanged();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategori güncellenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCategoryId) {
      setError("Silmek için kategori seçin.");
      return;
    }

    setError("");
    setDeleting(true);
    try {
      await api.delete(`/servers/${serverId}/categories/${selectedCategoryId}`);
      onChanged();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategori silinemedi");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Kategori Düzenle
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleUpdate} className="flex flex-col gap-4">
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Kategori
            </Label>
            <div className="rounded-lg bg-primary/10 px-4 py-2 text-base font-semibold text-primary border border-primary/30">
              {name}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Kategori Adı
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kategori"
              required
              minLength={3}
                maxLength={10}
              disabled={!selectedCategory}
              className="bg-background"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={deleting || !selectedCategory}
              onClick={handleDelete}
            >
              {deleting ? "Siliniyor..." : "Kategoriyi Sil"}
            </Button>
            <Button
              type="submit"
              disabled={loading || !selectedCategory}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? "Güncelleniyor..." : "Kategoriyi Kaydet"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

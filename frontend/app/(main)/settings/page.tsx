"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Eye, EyeOff, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { MyReports } from "@/components/moderation/my-reports";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function SettingsPage() {
  const { user, updateUser, deleteAccount } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState(user?.username || "");
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showDeletePassword, setShowDeletePassword] = useState(false);

  // New state for avatar preview
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url || null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Local preview
      setAvatarPreview(URL.createObjectURL(file));

      // Immediate upload
      const formData = new FormData();
      formData.append("file", file);

      try {
        const updatedUser = await api.post<User>("/auth/me/avatar", formData);
        updateUser(updatedUser);
        setSuccess(true);
      } catch (err) {
        console.error(err);
        setAvatarPreview(user?.avatar_url || null);
        setError("Avatar yüklenemedi");
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setLoading(true);
    try {
      const payload: Record<string, string> = {};
      if (username !== user?.username) payload.username = username;
      if (email !== user?.email) payload.email = email;
      if (password) payload.password = password;

      if (Object.keys(payload).length === 0) {
        setLoading(false);
        return;
      }

      const updated = await api.put<User>("/auth/me", payload);
      updateUser(updated);
      setPassword("");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Guncellenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError("");
    setDeleteLoading(true);
    try {
      await deleteAccount(deletePassword, deleteConfirmation);
      router.push("/login");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Silinirken hata olustu");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-secondary">
      <div className="mx-auto w-full max-w-lg p-4 sm:p-6 md:p-8">
        <button
          onClick={() => router.back()}
          className="mb-4 sm:mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Geri
        </button>

        <h1 className="mb-4 sm:mb-6 text-lg sm:text-xl font-bold text-foreground">
          Hesap Ayarları
        </h1>

        <form onSubmit={handleSave} className="flex flex-col gap-5">
          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md bg-[hsl(var(--success))]/10 px-4 py-3 text-sm text-[hsl(var(--success))]">
              Basariyla guncellendi.
            </div>
          )}

          {/* Avatar Preview */}
          <div className="flex items-center gap-6">
            <div className="group relative flex h-24 w-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-border bg-muted transition-colors hover:border-primary">
              {avatarPreview ? (
                <img
                  src={avatarPreview.startsWith("http") ? avatarPreview : `${process.env.NEXT_PUBLIC_API_URL}${avatarPreview}`}
                  alt="Avatar"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary text-2xl font-bold text-primary-foreground">
                  {username?.slice(0, 2).toUpperCase() || "?"}
                </div>
              )}
              
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="text-xs font-medium text-white">Degistir</span>
              </div>
              
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={handleAvatarChange}
                title="Profil fotoğrafını değiştirmek için tıkla"
              />
            </div>
            
            <div className="flex flex-col gap-1">
               <h3 className="text-lg font-semibold">{username}</h3>
               <p className="text-sm text-muted-foreground">Profil fotoğrafını özelleştir</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Kullanici Adi
            </Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={23}
              className="bg-background"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              E-posta
            </Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-background"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Yeni Sifre (degistirmek istiyorsan)
            </Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Bos birakirsan degismez"
                minLength={8}
                className="bg-background pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Save className="h-4 w-4" />
            {loading ? "Kaydediliyor..." : "Degisiklikleri Kaydet"}
          </Button>
        </form>

        {/* Tehlikeli Bölge - Hesap Silme */}
        <div className="mt-8 border-t border-destructive/20 pt-8">
          <h2 className="mb-4 text-lg font-bold text-destructive">
                     !Uyarı
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Hesabinizi kalici olarak silerseniz tum sunuculardan ayrilirsiniz,
            sahip oldugunuz bos sunucular silinir ve uyeleri olan sunucularin
            sahipligi devredilir.
          </p>
          <Button
            onClick={() => setDeleteDialogOpen(true)}
            variant="destructive"
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Hesabi Kalici Olarak Sil
          </Button>
        </div>

        <MyReports />
      </div>

      {/* Hesap Silme Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-background text-foreground">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Hesabinizi Silmek Istediginizden Emin Misiniz?
            </DialogTitle>
            <DialogDescription>
              Bu islem geri alinamaz. Tum verileriniz kalici olarak silinecek.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleDeleteAccount} className="flex flex-col gap-4">
            {deleteError && (
              <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {deleteError}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">
                Sifreniz
              </Label>
              <div className="relative">
                <Input
                  type={showDeletePassword ? "text" : "password"}
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  required
                  className="bg-secondary pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowDeletePassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showDeletePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">
                Onaylamak icin "onayliyorum" yazin
              </Label>
              <Input
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                required
                placeholder="onayliyorum"
                className="bg-secondary"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={deleteLoading}
              >
                Iptal
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={deleteLoading}
              >
                {deleteLoading ? "Siliniyor..." : "Hesabi Sil"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);
  const submitBtnRef = useRef<HTMLButtonElement | null>(null);
  const { login, googleLogin } = useAuth();
  const router = useRouter();
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!googleClientId || !googleBtnRef.current) return;

    let isCancelled = false;

    const renderGoogleButton = () => {
      const google = (window as any).google;
      if (isCancelled || !google?.accounts?.id || !googleBtnRef.current) return;

      const buttonWidth = Math.max(
        220,
        Math.floor(
          submitBtnRef.current?.getBoundingClientRect().width ??
            googleBtnRef.current.getBoundingClientRect().width,
        ),
      );

      googleBtnRef.current.innerHTML = "";
      google.accounts.id.renderButton(googleBtnRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "rectangular",
        width: buttonWidth,
        text: "signin_with",
      });
    };

    const initializeGoogleButton = () => {
      const google = (window as any).google;
      if (isCancelled || !google?.accounts?.id) return;

      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: { credential?: string }) => {
          if (!response?.credential) {
            setError("Google girisi basarisiz.");
            return;
          }

          setError("");
          setGoogleLoading(true);
          try {
            await googleLogin(response.credential);
            router.push("/servers");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Google girisi basarisiz");
          } finally {
            setGoogleLoading(false);
          }
        },
      });

      renderGoogleButton();
    };

    if ((window as any).google?.accounts?.id) {
      initializeGoogleButton();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogleButton;
    document.head.appendChild(script);

    window.addEventListener("resize", renderGoogleButton);

    return () => {
      isCancelled = true;
      window.removeEventListener("resize", renderGoogleButton);
    };
  }, [googleClientId, googleLogin, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      router.push("/servers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giris basarisiz");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4">
      {/* Gentle Glowing Background Effect */}
      <div className="absolute inset-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-violet-900/20 via-slate-950 to-slate-950" />
      
      {/* Main Glow Behind Card */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-violet-600/20 blur-[100px] opacity-50 animate-pulse" />

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-violet-500/20 bg-slate-900/50 p-8 shadow-2xl backdrop-blur-2xl ring-1 ring-white/10 sm:p-10 transition-all duration-300 hover:shadow-[0_0_50px_-10px_rgba(139,92,246,0.15)]">
        <Link
          href="/"
          className="absolute right-6 top-6 rounded-full bg-white/5 p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Kapat"
        >
          <X className="h-4 w-4" />
        </Link>
        
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">Hoş Geldin!</h1>
          <p className="text-slate-400">
            Hesabına giriş yap ve sohbete başla
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400 border border-red-500/20">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label
                htmlFor="username"
                className="text-xs font-medium uppercase tracking-wider text-slate-500"
              >
                E-posta
              </Label>
              <Input
                id="username"
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="bg-slate-950/50 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-violet-500 focus-visible:border-violet-500 h-11"
                placeholder="ornek@email.com"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="password"
                  className="text-xs font-medium uppercase tracking-wider text-slate-500"
                >
                  Şifre
                </Label>
                <Link href="#" className="text-xs text-cyan-400 hover:text-cyan-300">
                  Şifremi Unuttum?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-slate-950/50 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-violet-500 focus-visible:border-violet-500 pr-10 h-11"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              ref={submitBtnRef}
              type="submit"
              disabled={loading || googleLoading}
              className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white h-11 font-medium text-base shadow-lg shadow-violet-500/20 transition-all hover:scale-[1.02]"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Giriş Yapılıyor...</span>
                </div>
              ) : "Giriş Yap"}
            </Button>

            <div className="relative flex items-center gap-2 py-2">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs font-medium text-slate-500 uppercase">veya</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="h-[44px] flex justify-center">
                {googleClientId ? (
                  <div className="w-full flex justify-center" ref={googleBtnRef} />
                ) : (
                  <p className="text-center text-xs text-slate-500">
                    Google yapılandırması eksik.
                  </p>
                )}
            </div>

            <p className="text-center text-sm text-slate-400">
              Hesabın yok mu?{" "}
              <Link href="/register" className="font-medium text-cyan-400 hover:text-cyan-300 hover:underline transition-all">
                Kayıt Ol
              </Link>
            </p>
        </form>
      </div>
    </div>
  );
}

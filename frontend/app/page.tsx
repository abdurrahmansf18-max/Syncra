"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import type { Server } from "@/lib/types";
import { Users, MessageSquare, Lock, Zap, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateServerDialog } from "@/components/server/create-server-dialog";

export default function RootPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const fetchServers = async () => {
      try {
        const data = await api.get<Server[]>("/servers");
        setServers(data);
      } catch (error) {
        console.error("Sunucular yüklenirken hata:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchServers();
  }, []);

  const handleServerClick = (serverId: string) => {
    if (user) {
      router.push(`/servers/${serverId}`);
    } else {
      router.push("/login");
    }
  };

  const chartVars = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"];

  const getAccentStyle = (seed: string): CSSProperties => {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    }

    const chartVar = chartVars[hash % chartVars.length];

    return {
      ["--item-glow" as string]: `hsl(var(${chartVar}) / 0.45)`,
      ["--item-glow-soft" as string]: `hsl(var(${chartVar}) / 0.22)`,
      ["--item-surface" as string]: `hsl(var(${chartVar}) / 0.09)`,
      ["--item-avatar" as string]: `hsl(var(${chartVar}) / 0.26)`,
      ["--item-avatar-text" as string]: `hsl(var(${chartVar}) / 0.98)`,
    } as CSSProperties;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-secondary">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 relative selection:bg-cyan-500/30">
      {/* Background Gradient Spotlights */}
      <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-900/20 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/20 rounded-full blur-[120px]"></div>
      </div>
      
      <div className="relative z-10 flex flex-col min-h-screen">
      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center px-4 py-14 text-center sm:py-20 relative overflow-hidden">
        {/* Abstract Background Grid */}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        
        <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-neutral-900/40 px-4 py-16 shadow-2xl backdrop-blur-xl sm:px-10 sm:py-20 relative overflow-hidden ring-1 ring-white/10">
          
          {/* Background Glow Effects */}
          <div className="absolute top-0 left-1/4 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-0 right-1/4 translate-y-1/2 -translate-x-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none"></div>

          <div className="mb-8 flex flex-col items-center justify-center gap-6">
            
            {/* New Abstract 'S' Logo - Fix: Changed viewBox to 120x120 for padding */}
            <div className="relative group">
               <div className="absolute -inset-4 bg-gradient-to-r from-violet-600 to-cyan-600 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-500"></div>
               <svg width="100" height="100" viewBox="-10 -10 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative drop-shadow-2xl hover:scale-105 transition-transform duration-300">
                  <path d="M70 20C86.5685 20 100 33.4315 100 50C100 66.5685 86.5685 80 70 80H30C13.4315 80 0 66.5685 0 50C0 33.4315 13.4315 20 30 20H70Z" 
                        stroke="url(#paint0_linear)" strokeWidth="8" strokeLinecap="round"/>
                  <path d="M30 35H70C78.2843 35 85 41.7157 85 50C85 58.2843 78.2843 65 70 65H30C21.7157 65 15 58.2843 15 50C15 41.7157 21.7157 35 30 35Z" 
                        fill="url(#paint1_linear)"/>
                  <defs>
                    <linearGradient id="paint0_linear" x1="0" y1="50" x2="100" y2="50" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#8A2BE2"/>
                      <stop offset="1" stopColor="#00FFFF"/>
                    </linearGradient>
                    <linearGradient id="paint1_linear" x1="15" y1="50" x2="85" y2="50" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#8A2BE2" stopOpacity="0.2"/>
                      <stop offset="1" stopColor="#00FFFF" stopOpacity="0.8"/>
                    </linearGradient>
                  </defs>
              </svg>
            </div>

            <h1 className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-6xl font-black text-transparent drop-shadow-xl sm:text-7xl tracking-tight selection:bg-violet-500/30">
              Syncra
            </h1>
          </div>

          <p className="mb-6 text-2xl font-bold text-white sm:text-4xl drop-shadow-sm tracking-tight leading-tight">
            Topluluklarını birleştir.<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-200 to-cyan-200">Sohbetleri başlat, anılar yarat.</span>
          </p>
          
          <p className="mb-10 text-lg text-slate-300 font-medium max-w-2xl mx-auto leading-relaxed">
            Milyonlarca kullanıcının güvendiği, modern, hızlı ve güvenli yeni nesil iletişim platformu.
          </p>

          <div className="flex flex-col gap-5 sm:flex-row sm:justify-center items-center">
            {user ? (
               <Button
                onClick={() => router.push("/servers?create=true")}
                className="h-14 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-10 text-lg font-bold text-white shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-violet-500/25 border border-white/10"
               >
                 <Plus className="mr-2 h-6 w-6" />
                 Sunucu Oluştur
               </Button>
            ) : (
              <div className="flex flex-col items-center gap-6 w-full sm:w-auto">
                 {/* Main CTA */}
                 <button
                    onClick={() => router.push("/login")}
                    className="group relative inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-600 p-[2px] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_2rem_-0.5rem_#8b5cf6] focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-50 w-full sm:w-auto"
                  >
                    <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-2xl bg-slate-950 px-8 py-4 text-xl font-bold text-white backdrop-blur-3xl transition-all group-hover:bg-opacity-0">
                      Syncra'yı Başlat
                      <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </span>
                 </button>

                <div className="flex flex-row gap-4 w-full justify-center">
                  <button
                    onClick={() => router.push("/register")}
                    className="flex-1 sm:flex-none rounded-xl bg-white/5 border border-white/10 px-8 py-3 text-base font-semibold text-white transition-all hover:bg-white/10 hover:border-white/20"
                  >
                    Kayıt Ol
                  </button>
                  <button
                    onClick={() => router.push("/login")}
                    className="flex-1 sm:flex-none rounded-xl bg-white/5 border border-white/10 px-8 py-3 text-base font-semibold text-white transition-all hover:bg-white/10 hover:border-white/20"
                  >
                    Giriş Yap
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <CreateServerDialog 
        open={createOpen} 
        onOpenChange={setCreateOpen} 
        onCreated={() => {
           // Dialog handles redirection
        }} 
      />

      {/* Features Section */}
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-[0_0_0_2px_hsl(var(--chart-1)/0.45),0_0_20px_hsl(var(--chart-1)/0.22)] backdrop-blur transition-all duration-200 sm:p-6">
            <Users className="mb-3 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-semibold text-foreground">Topluluklar</h3>
            <p className="text-base text-blue-100/90 font-medium">İlgi alanlarına göre topluluklara katıl veya kendi topluluğunu kur.</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-[0_0_0_2px_hsl(var(--chart-2)/0.45),0_0_20px_hsl(var(--chart-2)/0.22)] backdrop-blur transition-all duration-200 sm:p-6">
            <MessageSquare className="mb-3 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-semibold text-foreground">Canlı Sohbet</h3>
            <p className="text-base text-blue-100/90 font-medium">Gerçek zamanlı mesajlaşma ve modern metin kanalları.</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-[0_0_0_2px_hsl(var(--chart-3)/0.45),0_0_20px_hsl(var(--chart-3)/0.22)] backdrop-blur transition-all duration-200 sm:p-6">
            <Lock className="mb-3 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-semibold text-foreground">Güvenli</h3>
            <p className="text-base text-blue-100/90 font-medium">Gizliliğin ön planda, verilerin güvende.</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-[0_0_0_2px_hsl(var(--chart-4)/0.45),0_0_20px_hsl(var(--chart-4)/0.22)] backdrop-blur transition-all duration-200 sm:p-6">
            <Zap className="mb-3 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-semibold text-foreground">Hızlı</h3>
            <p className="text-base text-blue-100/90 font-medium">Düşük gecikme, yüksek performans deneyimi.</p>
          </div>
        </div>
      </div>

      {/* Public Servers Section */}
      {servers.length > 0 && (
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-12">
          <div className="mb-8">
            <h2 className="mb-2 text-3xl font-bold text-foreground">
              Keşfet & Katıl
            </h2>
            <p className="text-muted-foreground">
              Yeni toplulukları keşfet ve hemen katılmaya başla
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {servers.map((server) => (
              <div
                key={server.id}
                style={getAccentStyle(server.id)}
                className="group overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(180deg,hsl(var(--card))_0%,var(--item-surface)_100%)] shadow-sm transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_0_0_1px_var(--item-glow),0_0_26px_var(--item-glow-soft)]"
              >
                <div className="flex h-32 items-center justify-center bg-[linear-gradient(145deg,var(--item-surface)_0%,hsl(var(--card))_100%)]">
                  <div
                    className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold"
                    style={{
                      backgroundColor: "var(--item-avatar)",
                      color: "var(--item-avatar-text)",
                    }}
                  >
                    {server.name.slice(0, 2).toUpperCase()}
                  </div>
                </div>

                <div className="p-6">
                  <h3 className="mb-2 line-clamp-2 text-lg font-semibold text-foreground">
                    {server.name}
                  </h3>
                  <p className="mb-4 text-sm text-muted-foreground">
                    Katılmak için tıkla ve topluluğun tadını çıkar
                  </p>

                  <Button
                    onClick={() => handleServerClick(server.id)}
                    className="w-full bg-primary text-primary-foreground transition-all hover:bg-primary/90 hover:gap-2"
                  >
                    <span>Katıl</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {servers.length === 0 && (
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="text-center">
            <Users className="mb-4 h-16 w-16 text-muted-foreground/40 mx-auto" />
            <h3 className="mb-2 text-xl font-semibold text-foreground">
              Henüz Sunucu Yok
            </h3>
            <p className="mb-6 text-muted-foreground">
              Kendi sunucunuzu oluşturmaya başlayın veya başkalarına katılın
            </p>
            {!user && (
              <Button
                onClick={() => router.push("/register")}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Kayıt Ol ve Başla
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="mt-12 border-t border-white/10 px-4 py-8 text-center bg-black/20 backdrop-blur-sm">
        <p className="text-sm text-slate-500 font-medium">
          © 2026 Syncra. Tüm hakları saklıdır.
        </p>
      </div>
    </div>
   </div> 
  );
}

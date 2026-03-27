"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Server } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { WS_BASE_URL } from "@/lib/constants";
import { Compass, Users, ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BanAlert } from "@/components/server/ban-alert";
import { Input } from "@/components/ui/input";
import { CreateServerDialog } from "@/components/server/create-server-dialog";

export default function ServersPage() {
  const [publicServers, setPublicServers] = useState<Server[]>([]);
  const [myServers, setMyServers] = useState<Server[]>([]);
  const [bannedServers, setBannedServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "owned" | "member" | "public" | "banned"
  >("all");
  const [error, setError] = useState<{
    message: string;
    reason?: string;
  } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token } = useAuth();

  useEffect(() => {
    if (searchParams?.get("create") === "true") {
      setCreateOpen(true);
    }
  }, [searchParams]);

  const refreshServers = async () => {
    const [pub, mine, banned] = await Promise.all([
      api.get<Server[]>('/servers').catch(() => []),
      api.get<Server[]>('/servers/me').catch(() => []),
      api.get<Server[]>('/servers/banned').catch(() => []),
    ]);

    setPublicServers(pub);
    setMyServers(mine);
    setBannedServers(banned);
    setLoading(false);
  };

  const handleJoinServer = async (serverId: string) => {
    setJoining(serverId);
    try {
      await api.post(`/servers/${serverId}/join`);
      router.push(`/servers/${serverId}`);
    } catch (err: any) {
      const message = err?.message || "Sunucuya katılamadınız.";
      const parts = message.split("Sebep: ");
      const mainMessage = parts[0].trim();
      const reason = parts[1] || undefined;
      setError({ message: mainMessage, reason });
    } finally {
      setJoining(null);
    }
  };

  useEffect(() => {
    refreshServers();

    const intervalId = window.setInterval(() => {
      refreshServers();
    }, 3000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshServers();
      }
    };

    window.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    const ws = new WebSocket(
      `${WS_BASE_URL}/ws/discovery?token=${encodeURIComponent(token)}`,
    );

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed?.type === "discovery_changed") {
          refreshServers();
        }
      } catch {
        // ignore malformed events
      }
    };

    return () => {
      ws.close();
    };
  }, [token]);

  const ownedServers = myServers.filter((s) => s.owner_id === user?.id);
  const memberServers = myServers.filter((s) => s.owner_id !== user?.id);
  const bannedServerIds = new Set(bannedServers.map((s) => s.id));
  const myServerIds = new Set(myServers.map((s) => s.id));
  const joinablePublicServers = publicServers.filter(
    (s) => !myServerIds.has(s.id) && !bannedServerIds.has(s.id),
  );

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase("tr");

  const getServerCode = (server: Server) =>
    server.handle?.startsWith("#") ? server.handle : `#${server.handle || server.id.slice(0, 8)}`;

  const matchesSearch = (server: Server) => {
    if (!normalizedSearch) return true;
    const name = server.name.toLocaleLowerCase("tr");
    const code = getServerCode(server).toLocaleLowerCase("tr");
    return (
      name.includes(normalizedSearch) ||
      code.includes(normalizedSearch) ||
      server.id.toLocaleLowerCase("tr").includes(normalizedSearch)
    );
  };

  const filteredOwnedServers = ownedServers.filter(matchesSearch);
  const filteredMemberServers = memberServers.filter(matchesSearch);
  const filteredJoinablePublicServers = joinablePublicServers.filter(matchesSearch);
  const filteredBannedServers = bannedServers.filter(matchesSearch);

  const canShow = {
    owned: activeFilter === "all" || activeFilter === "owned",
    member: activeFilter === "all" || activeFilter === "member",
    public: activeFilter === "all" || activeFilter === "public",
    banned: activeFilter === "all" || activeFilter === "banned",
  };

  const chartVars = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"];

  const getServerAccentStyle = (serverId: string): CSSProperties => {
    let hash = 0;
    for (let index = 0; index < serverId.length; index += 1) {
      hash = (hash * 31 + serverId.charCodeAt(index)) >>> 0;
    }
    const chartVar = chartVars[hash % chartVars.length];

    return {
      ["--server-glow" as string]: `hsl(var(${chartVar}) / 0.42)`,
      ["--server-glow-soft" as string]: `hsl(var(${chartVar}) / 0.22)`,
      ["--server-surface" as string]: `hsl(var(${chartVar}) / 0.08)`,
      ["--server-avatar" as string]: `hsl(var(${chartVar}) / 0.24)`,
      ["--server-avatar-text" as string]: `hsl(var(${chartVar}) / 0.98)`,
    } as CSSProperties;
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-secondary">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <BanAlert
        title="İşlem Başarısız"
        message={error.message}
        reason={error.reason}
        onReturn={() => setError(null)}
        returnButtonText="Sunuculara Dön"
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-gradient-to-b from-background via-secondary/30 to-background p-3 sm:p-6">
      <div className="mx-auto w-full max-w-5xl space-y-4 pb-2 sm:space-y-6 sm:pb-4">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="mb-4 flex items-center gap-2 sm:gap-3">
             <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md transition-transform group-hover:scale-105">
                <img src="/logo.svg" alt="Syncra" className="h-6 w-6" />
             </div>
            <div>
              <h1 className="text-lg font-bold text-foreground sm:text-2xl">
              Sunuculari Kesfet
              </h1>
              <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Herkese acik topluluklara goz at veya kendi sunucunu olustur.
              </p>
            </div>
          </div>

          <div className="mb-3 relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Sunucu adina veya #handle gore ara"
              className="rounded-full border-border/70 bg-background/80 pl-9"
            />
          </div>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {[
              { key: "all", label: "Hepsi" },
              { key: "owned", label: "Olusturdugum" },
              { key: "member", label: "Uye Olduklarim" },
              { key: "public", label: "Genel Sunucular" },
              { key: "banned", label: "Engelli/Banli" },
            ].map((item) => (
              <Button
                key={item.key}
                size="sm"
                variant={activeFilter === item.key ? "default" : "secondary"}
                className="shrink-0 rounded-full px-4"
                onClick={() =>
                  setActiveFilter(
                    item.key as "all" | "owned" | "member" | "public" | "banned",
                  )
                }
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Owned Servers */}
        {canShow.owned && filteredOwnedServers.length > 0 && (
          <section className="mb-6 sm:mb-8">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:mb-3">
              Olusturdugum Sunucular
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {filteredOwnedServers.map((s) => (
                <button
                  key={s.id}
                  onClick={() => router.push(`/servers/${s.id}`)}
                  style={getServerAccentStyle(s.id)}
                  className="flex items-center gap-2 rounded-2xl border border-border/70 bg-[linear-gradient(180deg,hsl(var(--card))_0%,var(--server-surface)_100%)] p-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_0_0_1px_var(--server-glow),0_0_24px_var(--server-glow-soft)] sm:gap-3 sm:p-4"
                >
                  <div
                    className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl text-xs sm:text-lg font-bold shrink-0"
                    style={{
                      backgroundColor: "var(--server-avatar)",
                      color: "var(--server-avatar-text)",
                    }}
                  >
                    {s.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate font-semibold text-xs sm:text-sm text-foreground">
                      {s.name}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {getServerCode(s)} • {s.is_published ? "Herkese Acik" : "Ozel"}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Member Servers */}
        {canShow.member && filteredMemberServers.length > 0 && (
          <section className="mb-6 sm:mb-8">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:mb-3">
              Uye Oldugum Sunucular
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {filteredMemberServers.map((s) => (
                <button
                  key={s.id}
                  onClick={() => router.push(`/servers/${s.id}`)}
                  style={getServerAccentStyle(s.id)}
                  className="flex items-center gap-2 rounded-2xl border border-border/70 bg-[linear-gradient(180deg,hsl(var(--card))_0%,var(--server-surface)_100%)] p-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_0_0_1px_var(--server-glow),0_0_24px_var(--server-glow-soft)] sm:gap-3 sm:p-4"
                >
                  <div
                    className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl text-xs sm:text-lg font-bold shrink-0"
                    style={{
                      backgroundColor: "var(--server-avatar)",
                      color: "var(--server-avatar-text)",
                    }}
                  >
                    {s.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate font-semibold text-xs sm:text-sm text-foreground">
                      {s.name}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {getServerCode(s)} • Uye
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Public Servers */}
        {canShow.public && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Genel Sunucular (Katilabilecegin)
            </h2>
            {filteredJoinablePublicServers.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/70 bg-card/70 p-4 text-center sm:p-8">
                <Users className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/40" />
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Uygun genel sunucu bulunamadi.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {filteredJoinablePublicServers.map((s) => {
                  return (
                    <div
                      key={s.id}
                      style={getServerAccentStyle(s.id)}
                      className="flex items-center gap-2 rounded-2xl border border-border/70 bg-[linear-gradient(180deg,hsl(var(--card))_0%,var(--server-surface)_100%)] p-3 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_0_0_1px_var(--server-glow),0_0_24px_var(--server-glow-soft)] sm:gap-3 sm:p-4"
                    >
                      <div
                        className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl text-xs sm:text-lg font-bold shrink-0"
                        style={{
                          backgroundColor: "var(--server-avatar)",
                          color: "var(--server-avatar-text)",
                        }}
                      >
                        {s.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate font-semibold text-xs sm:text-sm text-foreground">
                          {s.name}
                        </p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">
                          {getServerCode(s)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="whitespace-nowrap rounded-full bg-primary px-4 text-xs text-primary-foreground"
                        onClick={() => handleJoinServer(s.id)}
                        disabled={joining === s.id}
                      >
                        {joining === s.id ? "Katılıyor..." : "Katil"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Banned/Inaccessible Servers */}
        {canShow.banned && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:mb-3">
              Engelli / Banli Sunucular
            </h2>
            {filteredBannedServers.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/70 bg-card/70 p-4 text-center sm:p-8">
                <Users className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/40" />
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Banli oldugun sunucu yok.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {filteredBannedServers.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-2xl border border-destructive/45 bg-destructive/10 p-3 opacity-95 shadow-sm transition-colors duration-200 hover:bg-destructive/20 hover:shadow-[0_0_0_1px_hsl(var(--destructive)/0.45),0_0_22px_hsl(var(--destructive)/0.22)] sm:gap-3 sm:p-4"
                  >
                    <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-destructive/20 text-xs sm:text-lg font-bold text-destructive shrink-0">
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate font-semibold text-xs sm:text-sm text-foreground">
                        {s.name}
                      </p>
                      <p className="text-[10px] sm:text-xs text-destructive">
                        {getServerCode(s)} • Erisim Engelli
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled
                      className="text-xs"
                    >
                      Engellendi
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Create Server Dialog */}
      <CreateServerDialog 
        open={createOpen} 
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
             const newParams = new URLSearchParams(searchParams.toString());
             newParams.delete("create");
             router.replace(`/servers?${newParams.toString()}`);
          }
        }} 
        onCreated={() => {
          refreshServers();
          const newParams = new URLSearchParams(searchParams.toString());
          newParams.delete("create");
          router.replace(`/servers?${newParams.toString()}`);
        }} 
      />
    </div>
  );
}

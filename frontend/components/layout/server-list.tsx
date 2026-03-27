"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Server } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Plus, Compass, LogOut, PanelLeftClose, Settings, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CreateServerDialog } from "@/components/server/create-server-dialog";

interface ServerListProps {
  onToggle?: () => void;
}

export function ServerList({ onToggle }: ServerListProps) {
  const [servers, setServers] = useState<Server[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const router = useRouter();
  const params = useParams();
  const { logout, user } = useAuth();
  const activeServerId = params?.serverId as string | undefined;

  const refreshServers = () => {
    api
      .get<Server[]>("/servers/me")
      .then(setServers)
      .catch(() => {});
  };

  useEffect(() => {
    refreshServers();
  }, [activeServerId]);

  const ownedServers = servers
    .filter((server) => server.owner_id === user?.id)
    .sort((first, second) => first.name.localeCompare(second.name, "tr"));
  const memberServers = servers
    .filter((server) => server.owner_id !== user?.id)
    .sort((first, second) => first.name.localeCompare(second.name, "tr"));

  // Listen for server updates from other components
  useEffect(() => {
    const handleServerUpdate = () => {
      refreshServers();
    };

    window.addEventListener("serverUpdated", handleServerUpdate);
    return () => {
      window.removeEventListener("serverUpdated", handleServerUpdate);
    };
  }, []);

  const listButtonPadding = "w-full justify-start gap-3 px-2 py-1.5";
  const avatarSize = "h-10 w-10 md:h-12 md:w-12";

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className="flex h-full min-h-0 w-52 flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(220,13%,8%)] py-3 md:w-60"
      >
        <div className="flex items-center gap-2 px-2">
          {onToggle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onToggle}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Sunucu Listesini Kapat</TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-3 px-2">
          {/* Main Logo & Home Link */}
          <div className="mb-2 px-1">
             <button 
                onClick={() => {
                  router.push("/servers");
                  onToggle?.();
                }}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl p-2 transition-all hover:bg-white/5 active:translate-y-0.5",
                  !activeServerId && "bg-white/10"
                )}
             >
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md transition-transform group-hover:scale-105">
                   <img src="/logo.svg" alt="Syncra" className="h-6 w-6" />
                </div>
                <div className="flex flex-col items-start overflow-hidden">
                   <span className="truncate text-sm font-bold text-white">Syncra</span>
                   <span className="truncate text-[10px] font-medium text-indigo-200/70">Topluluk Platformu</span>
                </div>
             </button>
          </div>

          <div className="mx-4 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
            {/* Owned servers */}
            {ownedServers.length > 0 && (
              <div className="space-y-1">
                {ownedServers.map((server) => (
                  <Tooltip key={server.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          router.push(`/servers/${server.id}`);
                          onToggle?.();
                        }}
                        className={cn(
                          "group flex items-center rounded-2xl transition-all hover:rounded-xl hover:bg-emerald-500/10 hover:shadow-[0_0_18px_rgba(16,185,129,0.35)]",
                          listButtonPadding,
                          activeServerId === server.id && "bg-primary/20",
                        )}
                      >
                        <span
                          className={cn(
                            "flex items-center justify-center rounded-2xl text-xs font-semibold md:text-sm",
                            avatarSize,
                            activeServerId === server.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 hover:text-emerald-200",
                          )}
                        >
                          {server.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="truncate text-sm font-semibold text-foreground">
                          {server.name}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{server.name} (Kurdugun)</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}

            {ownedServers.length > 0 && memberServers.length > 0 && (
              <div className="h-[2px] w-full rounded-full bg-gradient-to-r from-emerald-400/70 via-border to-sky-400/70" />
            )}

            {/* Member servers */}
            {memberServers.length > 0 && (
              <div className="space-y-1">
                {memberServers.map((server) => (
                  <Tooltip key={server.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          router.push(`/servers/${server.id}`);
                          onToggle?.();
                        }}
                        className={cn(
                          "group flex items-center rounded-2xl transition-all hover:rounded-xl hover:bg-sky-500/10 hover:shadow-[0_0_18px_rgba(56,189,248,0.35)]",
                          listButtonPadding,
                          activeServerId === server.id && "bg-primary/20",
                        )}
                      >
                        <span
                          className={cn(
                            "flex items-center justify-center rounded-2xl text-xs font-semibold md:text-sm",
                            avatarSize,
                            activeServerId === server.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 hover:text-sky-200",
                          )}
                        >
                          {server.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="truncate text-sm font-semibold text-foreground">
                          {server.name}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{server.name} (Uye)</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>

          {/* Create server */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowCreate(true)}
                className={cn(
                  "group flex items-center rounded-2xl bg-card text-[hsl(var(--success))] transition-all hover:rounded-xl hover:bg-[hsl(var(--success))] hover:text-black hover:shadow-[0_0_18px_rgba(34,197,94,0.35)]",
                  listButtonPadding,
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-2xl",
                    avatarSize,
                    "bg-card group-hover:bg-transparent",
                  )}
                >
                  <Plus className="h-4 w-4 md:h-5 md:w-5" />
                </span>
                <span className="truncate text-sm font-semibold">Sunucu Olustur</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Sunucu Olustur</TooltipContent>
          </Tooltip>
        </div>

        <div className="mt-auto px-2 pb-3 pt-2 border-t border-[hsl(var(--sidebar-border))] bg-[hsl(220,13%,10%)]">
            <div className="flex w-full items-center justify-between rounded-lg bg-[hsl(220,13%,14%)] p-2 select-none">
              <div 
                onClick={() => router.push("/settings")}
                className="flex flex-1 items-center gap-2 overflow-hidden cursor-pointer group"
              >
                  <div className="relative h-8 w-8 shrink-0">
                    <div className="h-full w-full overflow-hidden rounded-full transition-transform group-hover:scale-105 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                      {user?.avatar_url ? (
                         <img 
                            src={user.avatar_url.startsWith("http") ? user.avatar_url : `${process.env.NEXT_PUBLIC_API_URL}${user.avatar_url}`}
                            alt={user.username}
                            className="h-full w-full object-cover"
                         />
                      ) : (
                         user?.username?.slice(0, 2).toUpperCase() || "?"
                      )}
                    </div>
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[hsl(220,13%,14%)]" />
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="truncate text-[13px] font-bold text-gray-200 group-hover:text-white transition-colors">
                      {user?.username || "Misafir"}
                    </span>
                    <span className="truncate text-[10px] text-gray-400">
                      Aktif
                    </span>
                  </div>
              </div>

              <div className="flex items-center gap-1">
                <Tooltip>
                   <TooltipTrigger asChild>
                      <button 
                        onClick={() => router.push("/settings")}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-[hsl(220,13%,20%)] hover:text-gray-100 transition-colors"
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                   </TooltipTrigger>
                   <TooltipContent>Ayarlar</TooltipContent>
                </Tooltip>
                
                <Tooltip>
                   <TooltipTrigger asChild>
                      <button 
                        onClick={() => {
                          logout();
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <LogOut className="h-4 w-4" />
                      </button>
                   </TooltipTrigger>
                   <TooltipContent>Cikis Yap</TooltipContent>
                </Tooltip>
              </div>
            </div>
        </div>

        <CreateServerDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          onCreated={refreshServers}
        />
      </aside>
    </TooltipProvider>
  );
}

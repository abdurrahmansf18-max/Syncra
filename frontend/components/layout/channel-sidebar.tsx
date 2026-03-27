"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import type {
  Channel,
  Server,
  Membership,
  Category,
  ServerLimitUsage,
  UserLimitStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Hash,
  Volume2,
  ChevronDown,
  ChevronRight,
  Settings,
  UserPlus,
  PlusCircle,
  LogOut,
  Flag,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useVoice } from "@/lib/voice-context";
import { ROLE_HIERARCHY } from "@/lib/constants";
import { InviteDialog } from "@/components/server/invite-dialog";
import { CreateChannelDialog } from "@/components/server/create-channel-dialog";
import { ServerSettingsDialog } from "@/components/server/server-settings-dialog";
import { CreateCategoryDialog } from "@/components/server/create-category-dialog";
import { EditCategoryDialog } from "@/components/server/edit-category-dialog";
import { EditChannelDialog } from "@/components/server/edit-channel-dialog";
import { ReportList } from "@/components/moderation/report-list";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ChannelSidebar({ onItemClick }: { onItemClick?: () => void }) {
  const [server, setServer] = useState<Server | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [selectedChannelIdForEdit, setSelectedChannelIdForEdit] =
    useState<string>("");
  const [selectedCategoryIdForEdit, setSelectedCategoryIdForEdit] =
    useState<string>("");
  const [showInvite, setShowInvite] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showEditChannel, setShowEditChannel] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [showEditCategory, setShowEditCategory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [sidebarError, setSidebarError] = useState("");
  const [serverLimitUsage, setServerLimitUsage] = useState<ServerLimitUsage | null>(null);
  const [userLimitStatus, setUserLimitStatus] = useState<UserLimitStatus | null>(null);
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { joinChannel } = useVoice();
  const serverId = params?.serverId as string;
  const channelId = params?.channelId as string;

  useEffect(() => {
    if (!serverId) return;
    api
      .get<Server>(`/servers/${serverId}`)
      .then(setServer)
      .catch((err) =>
        setSidebarError(
          err instanceof Error ? err.message : "Sunucu bilgisi alınamadı",
        ),
      );
    api
      .get<Channel[]>(`/servers/${serverId}/channels`)
      .then(setChannels)
      .catch((err) =>
        setSidebarError(
          err instanceof Error ? err.message : "Kanallar alınamadı",
        ),
      );
    api
      .get<Category[]>(`/servers/${serverId}/categories`)
      .then(setCategories)
      .catch((err) => {
        setCategories([]);
        setSidebarError(
          err instanceof Error ? err.message : "Kategoriler alınamadı",
        );
      });
    if (user) {
      api
        .get<Membership[]>(`/servers/${serverId}/members`)
        .then((members) => {
          const me = members.find((m) => m.user_id === user.id);
          if (me) setMembership(me);
        })
        .catch((err) =>
          setSidebarError(
            err instanceof Error ? err.message : "Üyelik bilgisi alınamadı",
          ),
        );

      api
        .get<UserLimitStatus>("/servers/limits/me")
        .then(setUserLimitStatus)
        .catch(() => setUserLimitStatus(null));

      api
        .get<ServerLimitUsage>(`/servers/${serverId}/limits/usage`)
        .then(setServerLimitUsage)
        .catch(() => setServerLimitUsage(null));
    }
  }, [serverId, user]);

  const refreshChannels = () => {
    setSidebarError("");
    api
      .get<Channel[]>(`/servers/${serverId}/channels`)
      .then(setChannels)
      .catch((err) =>
        setSidebarError(
          err instanceof Error ? err.message : "Kanallar alınamadı",
        ),
      );
    api
      .get<Category[]>(`/servers/${serverId}/categories`)
      .then(setCategories)
      .catch((err) => {
        setCategories([]);
        setSidebarError(
          err instanceof Error ? err.message : "Kategoriler alınamadı",
        );
      });
  };

  useEffect(() => {
    const handleChannelListChanged = (event: Event) => {
      const customEvent = event as CustomEvent;
      const targetServerId = customEvent.detail?.server_id;
      if (targetServerId && String(targetServerId) !== String(serverId)) {
        return;
      }
      refreshChannels();
    };

    window.addEventListener("channelListChanged", handleChannelListChanged);
    return () => {
      window.removeEventListener("channelListChanged", handleChannelListChanged);
    };
  }, [serverId]);

  const myRole = membership?.role || "member";
  const isAdmin = myRole === "admin";
  const isOwner = server?.owner_id === user?.id;
  const roleRank: Record<string, number> = { admin: 3, mod: 2, member: 1 };
  const inviteMinRole = server?.invite_min_role || "member";
  const canCreateInvite =
    roleRank[myRole] >= roleRank[inviteMinRole];

  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");
  const uncategorizedText = textChannels.filter((ch) => !ch.category_id);
  const uncategorizedVoice = voiceChannels.filter((ch) => !ch.category_id);

  const renderChannelButton = (ch: Channel, isVoice: boolean) => {
    const canView =
      ROLE_HIERARCHY[myRole] >= ROLE_HIERARCHY[ch.min_role_to_view];
    if (!canView) return null;

    return (
      <div
        key={ch.id}
        className="group relative flex w-full items-center gap-2 px-2 py-0.5"
      >
        <button
          onClick={() => {
            if (isVoice) {
              joinChannel(ch.id, ch.name);
            }
            router.push(`/servers/${serverId}/channels/${ch.id}`);
            onItemClick?.();
          }}
          className={cn(
            "flex h-9 flex-1 items-center gap-2.5 rounded-md px-2.5 text-[15px] font-medium transition-all",
            channelId === ch.id
              ? "bg-primary/10 text-primary hover:bg-primary/15"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          {isVoice ? (
            <Volume2 className={cn("h-4 w-4 shrink-0 transition-opacity", channelId === ch.id ? "opacity-100" : "opacity-70 group-hover:opacity-100")} />
          ) : (
            <Hash className={cn("h-4 w-4 shrink-0 transition-opacity", channelId === ch.id ? "opacity-100" : "opacity-70 group-hover:opacity-100")} />
          )}
          <span className="truncate">{ch.name}</span>
          {!isVoice && ch.min_role_to_view !== "member" && (
            <span className="ml-auto rounded-md bg-background/20 px-1.5 py-0.5 text-[10px] font-semibold opacity-70">
              {ch.min_role_to_view === "admin" ? "Y" : "M"}
            </span>
          )}
        </button>
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedChannelIdForEdit(ch.id);
              setShowEditChannel(true);
            }}
            className="flex md:hidden md:group-hover:flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-background/20 hover:text-foreground active:text-foreground absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6"
            title="Kanalı Düzenle"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };

  const handleLeave = async () => {
    setLeaveError("");
    setLeaveLoading(true);
    try {
      await api.delete(`/servers/${serverId}/leave`);
      setShowLeaveConfirm(false);
      window.dispatchEvent(new CustomEvent("serverUpdated"));
      router.push("/servers");
    } catch (err) {
      setLeaveError(err instanceof Error ? err.message : "Ayrilamadi");
    } finally {
      setLeaveLoading(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  if (!serverId) return null;

  return (
    <aside className="flex h-full w-60 min-h-0 flex-col overflow-hidden border-r border-border bg-card/95 backdrop-blur md:w-64 transition-[width] duration-300">
      {/* Server Header */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-14 w-full items-center justify-between border-b border-border bg-card px-4 text-left transition-all hover:bg-accent/50">
            <span className="truncate text-[15px] font-bold text-foreground">
              {server?.name || "Yukleniyor..."}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60 shadow-xl border-border/60 bg-popover/95 backdrop-blur-xl">
          {canCreateInvite && (
            <DropdownMenuItem onClick={() => setShowInvite(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Davet Olustur
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setShowReports(true)}>
            <Flag className="mr-2 h-4 w-4" />
            Sikayetler ve Bildirimler
          </DropdownMenuItem>
          {!isOwner && (
            <DropdownMenuItem
              onClick={() => setShowLeaveConfirm(true)}
              className="text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sunucudan Ayril
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowCreateCategory(true)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Kategori Olustur
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowCreateChannel(true)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Kanal Olustur
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowSettings(true)}>
                <Settings className="mr-2 h-4 w-4" />
                Sunucu Ayarlari
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {isOwner && serverLimitUsage && (
        <div className="shrink-0 border-b border-[hsl(var(--sidebar-border))] px-3 py-2.5">
          <div className="rounded-xl border border-border/70 bg-card/70 p-2.5 shadow-sm">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Limitler (Sahip)
            </p>
            <div className="space-y-1.5 text-[12px] leading-5 text-foreground">
              <div className="flex items-center justify-between rounded-lg bg-primary/10 px-2 py-1">
                <span className="font-medium">Metin kanalı</span>
                <span className="text-primary font-semibold">
                  {serverLimitUsage.usage.text_channels}/{serverLimitUsage.limits.max_text_channels}
                  <span className="ml-1 text-xs text-muted-foreground">
                    (kalan {Math.max(0, serverLimitUsage.limits.max_text_channels - serverLimitUsage.usage.text_channels)})
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-violet-500/10 px-2 py-1">
                <span className="font-medium">Ses kanalı</span>
                <span className="text-violet-300 font-semibold">
                  {serverLimitUsage.usage.voice_channels}/{serverLimitUsage.limits.max_voice_channels}
                  <span className="ml-1 text-xs text-muted-foreground">
                    (kalan {Math.max(0, serverLimitUsage.limits.max_voice_channels - serverLimitUsage.usage.voice_channels)})
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-2 py-1">
                <span className="font-medium">Üye sayısı</span>
                <span className="font-semibold text-emerald-200">
                  {serverLimitUsage.usage.members}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-amber-500/10 px-2 py-1">
                <span className="font-medium">Aktif ses</span>
                <span className="font-semibold text-amber-200">
                  {serverLimitUsage.usage.active_voice_presence}
                </span>
              </div>
              {userLimitStatus && (
                <>
                  <div className="flex items-center justify-between rounded-lg bg-sky-500/10 px-2 py-1">
                    <span className="font-medium">Katildigin sunucu</span>
                    <span className="font-semibold text-sky-200">
                      {userLimitStatus.usage.joined_servers}/{userLimitStatus.limits.max_joined_servers_per_user}
                      <span className="ml-1 text-xs text-muted-foreground">
                        (kalan {Math.max(0, userLimitStatus.limits.max_joined_servers_per_user - userLimitStatus.usage.joined_servers)})
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-primary/10 px-2 py-1">
                    <span className="font-medium">Olusturdugun sunucu</span>
                    <span className="font-semibold text-primary">
                      {userLimitStatus.usage.owned_servers}/{userLimitStatus.limits.max_owned_servers_per_user}
                      <span className="ml-1 text-xs text-muted-foreground">
                        (kalan {Math.max(0, userLimitStatus.limits.max_owned_servers_per_user - userLimitStatus.usage.owned_servers)})
                      </span>
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Channel List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        {sidebarError && (
          <div className="mb-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            {sidebarError}
          </div>
        )}

        {(uncategorizedText.length > 0 || uncategorizedVoice.length > 0) && (
          <div className="mb-2">
            {uncategorizedText.map((ch) => renderChannelButton(ch, false))}
            {uncategorizedVoice.map((ch) => renderChannelButton(ch, true))}
          </div>
        )}

        {categories.map((category) => {
          const categoryChannels = channels.filter(
            (ch) => ch.category_id === category.id,
          );
          if (categoryChannels.length === 0) return null;

          const isExpanded = expandedCategories.has(category.id);

          return (
            <div key={category.id} className="mb-2">
              <div className="group flex items-center justify-between px-2 py-1">
                <div className="flex items-center gap-1 flex-1">
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="rounded p-0.5 text-muted-foreground transition-transform hover:bg-accent hover:text-foreground"
                  >
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 transition-transform",
                        isExpanded && "rotate-90",
                      )}
                    />
                  </button>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/85">
                    {category.name}
                  </p>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setSelectedCategoryIdForEdit(category.id);
                      setShowEditCategory(true);
                    }}
                    className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {isExpanded && (
                <div>
                  {categoryChannels.map((ch) =>
                    renderChannelButton(ch, ch.type === "voice"),
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {server && (
        <>
          <InviteDialog
            open={showInvite}
            onOpenChange={setShowInvite}
            serverId={server.id}
            myRole={myRole}
            inviteMinRole={server.invite_min_role}
          />
          <CreateChannelDialog
            open={showCreateChannel}
            onOpenChange={setShowCreateChannel}
            serverId={server.id}
            categories={categories}
            onCreated={refreshChannels}
          />
          <EditChannelDialog
            open={showEditChannel}
            onOpenChange={setShowEditChannel}
            serverId={server.id}
            channels={channels}
            categories={categories}
            selectedChannelIdFromParent={selectedChannelIdForEdit}
            onUpdated={refreshChannels}
          />
          <CreateCategoryDialog
            open={showCreateCategory}
            onOpenChange={setShowCreateCategory}
            serverId={server.id}
            onCreated={() => refreshChannels()}
          />
          <EditCategoryDialog
            open={showEditCategory}
            onOpenChange={setShowEditCategory}
            serverId={server.id}
            categories={categories}
            selectedCategoryIdFromParent={selectedCategoryIdForEdit}
            onChanged={() => refreshChannels()}
          />
          <ServerSettingsDialog
            open={showSettings}
            onOpenChange={setShowSettings}
            server={server}
            onUpdated={(s) => setServer(s)}
          />
          <Dialog open={showReports} onOpenChange={setShowReports}>
            <DialogContent className="bg-card w-[95vw] max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-foreground">Sikayetler</DialogTitle>
              </DialogHeader>
              <ReportList serverId={server.id} myRole={myRole} />
            </DialogContent>
          </Dialog>
        </>
      )}

      <Dialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Sunucudan Ayril?
            </DialogTitle>
          </DialogHeader>
          {leaveError && (
            <p className="text-sm text-destructive">{leaveError}</p>
          )}
          <p className="text-sm text-muted-foreground">
            Bu sunucudan ayrilmak istediginize emin misiniz?
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowLeaveConfirm(false)}
            >
              Vazgec
            </Button>
            <Button
              type="button"
              onClick={handleLeave}
              disabled={leaveLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {leaveLoading ? "Ayriliyor..." : "Evet, Ayril"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

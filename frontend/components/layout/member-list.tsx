"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Membership, MemberRole, Server } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { ROLE_HIERARCHY } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Shield, ShieldAlert, Star, User as UserIcon, VolumeX } from "lucide-react";
import { MemberManageDialog } from "@/components/moderation/member-manage-dialog";

const ROLE_CONFIG: Record<
  MemberRole,
  { label: string; icon: typeof Shield; color: string }
> = {
  admin: { label: "Adminler", icon: ShieldAlert, color: "text-destructive" },
  mod: { label: "Moderatorler", icon: Shield, color: "text-primary" },
  member: { label: "Uyeler", icon: UserIcon, color: "text-muted-foreground" },
};

type MemberListVariant = "desktop" | "mobile";

const sortMembers = (list: Membership[]) =>
  [...list].sort((first, second) => {
    if (first.is_online !== second.is_online) {
      return first.is_online ? -1 : 1;
    }
    const firstName = first.user?.username?.toLocaleLowerCase("tr") || "";
    const secondName = second.user?.username?.toLocaleLowerCase("tr") || "";
    return firstName.localeCompare(secondName, "tr");
  });

export function MemberList({ variant = "desktop" }: { variant?: MemberListVariant }) {
  const [members, setMembers] = useState<Membership[]>([]);
  const [bannedMembers, setBannedMembers] = useState<Membership[]>([]);
  const [selectedMember, setSelectedMember] = useState<Membership | null>(null);
  const [myRole, setMyRole] = useState<MemberRole>("member");
  const [server, setServer] = useState<Server | null>(null);
  const params = useParams();
  const { user } = useAuth();
  const serverId = params?.serverId as string;

  const loadMembers = () => {
    api
      .get<Membership[]>(`/servers/${serverId}/members`)
      .then((data) => {
        setMembers(data);

        let nextRole: MemberRole = "member";
        if (user) {
          const me = data.find((m) => m.user_id === user.id);
          if (me) {
            nextRole = me.role;
            setMyRole(me.role);
          }
        }

        if (nextRole === "admin") {
          api
            .get<Membership[]>(`/servers/${serverId}/members/banned`)
            .then(setBannedMembers)
            .catch(() => setBannedMembers([]));
        } else {
          setBannedMembers([]);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!serverId) return;
    api
      .get<Server>(`/servers/${serverId}`)
      .then(setServer)
      .catch(() => {});
    loadMembers();
  }, [serverId, user]);

  useEffect(() => {
    if (!serverId) return;
    const intervalId = setInterval(() => {
      loadMembers();
    }, 15000);

    return () => {
      clearInterval(intervalId);
    };
  }, [serverId, user]);

  // Listen for online/offline status changes from layout.tsx
  useEffect(() => {
    const handleStatusChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      // Backend sends { type: "user_online_status_changed", data: {...} }
      const { user_id, is_online, last_seen_at } = customEvent.detail?.data || customEvent.detail;
      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === user_id ? { ...m, is_online, last_seen_at } : m,
        ),
      );
      setBannedMembers((prev) =>
        prev.map((m) =>
          m.user_id === user_id ? { ...m, is_online, last_seen_at } : m,
        ),
      );
    };

    const handleMemberUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const payload = customEvent.detail?.data || customEvent.detail;
      const { user_id, role, is_banned, mute_until } = payload || {};
      if (!user_id) return;

      if (typeof is_banned === "boolean") {
        loadMembers();
        return;
      }

      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === user_id
            ? {
                ...m,
                role: role ?? m.role,
                is_banned: typeof is_banned === "boolean" ? is_banned : m.is_banned,
                mute_until: mute_until ?? m.mute_until,
              }
            : m,
        ),
      );

      setBannedMembers((prev) =>
        prev.map((m) =>
          m.user_id === user_id
            ? {
                ...m,
                role: role ?? m.role,
                is_banned: typeof is_banned === "boolean" ? is_banned : m.is_banned,
                mute_until: mute_until ?? m.mute_until,
              }
            : m,
        ),
      );
    };

    window.addEventListener("userOnlineStatusChanged", handleStatusChange);
    window.addEventListener("memberUpdated", handleMemberUpdated);
    return () => {
      window.removeEventListener("userOnlineStatusChanged", handleStatusChange);
      window.removeEventListener("memberUpdated", handleMemberUpdated);
    };
  }, []);

  const refreshMembers = () => {
    loadMembers();
  };

  const canManage = ROLE_HIERARCHY[myRole] >= ROLE_HIERARCHY["mod"];

  const isMutedNow = (muteUntil: string | null | undefined) => {
    if (!muteUntil) return false;
    return new Date(muteUntil).getTime() > Date.now();
  };

  const getRemainingMuteText = (muteUntil: string | null | undefined) => {
    if (!muteUntil) return "";
    const totalMs = new Date(muteUntil).getTime() - Date.now();
    if (totalMs <= 0) return "";

    const totalMinutes = Math.ceil(totalMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}s ${minutes}d`;
    }
    return `${minutes}d`;
  };

  const grouped = {
    admin: sortMembers(members.filter((m) => m.role === "admin" && !m.is_banned && !isMutedNow(m.mute_until))),
    mod: sortMembers(members.filter((m) => m.role === "mod" && !m.is_banned && !isMutedNow(m.mute_until))),
    member: sortMembers(members.filter((m) => m.role === "member" && !m.is_banned && !isMutedNow(m.mute_until))),
  };

  const mutedMembers = sortMembers(
    members.filter((m) => !m.is_banned && isMutedNow(m.mute_until)),
  );

  const sortedBannedMembers = sortMembers(bannedMembers);

  const containerClass =
    variant === "mobile"
      ? "flex h-full w-full min-h-0 flex-col overflow-hidden bg-[hsl(var(--sidebar))]"
      : "hidden h-full w-60 min-h-0 flex-col overflow-hidden bg-[hsl(var(--sidebar))] md:flex";

  return (
    <aside className={containerClass}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
          {(["admin", "mod", "member"] as MemberRole[]).map((role) => {
            const group = grouped[role];
            if (group.length === 0) return null;
            const config = ROLE_CONFIG[role];
            const Icon = config.icon;
            return (
              <div key={role} className="mb-4 last:mb-0">
                <p className="mb-1 flex items-center gap-1 px-1 text-xs font-semibold uppercase text-muted-foreground">
                  <Icon className={cn("h-3 w-3", config.color)} />
                  {config.label} - {group.length}
                </p>
                {group.map((m) => {
                  const isCurrentUser = m.user_id === user?.id;
                  return (
                  <div key={m.user_id} className="group relative">
                    <button
                      onClick={() =>
                        canManage && !isCurrentUser
                          ? setSelectedMember(m)
                          : undefined
                      }
                      className={cn(
                        "mb-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground",
                        isCurrentUser 
                          ? "bg-green-500/10 hover:bg-green-500/20" 
                          : "bg-blue-500/10 hover:bg-blue-500/20",
                        canManage && !isCurrentUser && "cursor-pointer",
                      )}
                    >
                      <div className="relative h-8 w-8 shrink-0">
                        <div
                          className={cn(
                            "flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-xs font-semibold",
                             m.is_online
                               ? "ring-2 ring-green-500/60 shadow-lg shadow-green-500/40 animate-pulse"
                               : "",
                             !m.user?.avatar_url && (m.is_online ? "bg-green-500/20 text-green-100" : "bg-accent text-foreground")
                          )}
                        >
                          {m.user?.avatar_url ? (
                             <img 
                                src={m.user.avatar_url.startsWith("http") ? m.user.avatar_url : `${process.env.NEXT_PUBLIC_API_URL}${m.user.avatar_url}`}
                                alt={m.user.username}
                                className="h-full w-full object-cover"
                             />
                          ) : (
                             m.user?.username?.slice(0, 2).toUpperCase() || "??"
                          )}
                        </div>
                        {/* Online/Offline Indicator */}
                        <div
                          className={cn(
                            "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[hsl(var(--sidebar))]",
                            m.is_online
                              ? "bg-green-500 animate-pulse"
                              : "bg-gray-400",
                          )}
                          title={
                            m.is_online
                              ? "Çevrim içi"
                              : `Son görülme: ${m.last_seen_at ? new Date(m.last_seen_at).toLocaleString("tr-TR") : "bilinmiyor"}`
                          }
                        />
                      </div>
                      <span className="flex-1 truncate">
                        {m.user?.username || "Bilinmeyen"}
                      </span>
                      {m.is_online && (
                        <span className="ml-2 rounded bg-green-600/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          Aktif
                        </span>
                      )}
                      {isCurrentUser && (
                        <span className="ml-auto shrink-0 rounded bg-green-600/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          Ben
                        </span>
                      )}
                      {role === "admin" && m.user_id === server?.owner_id && !isCurrentUser && (
                        <Star className="ml-auto h-3 w-3 shrink-0 text-amber-400" />
                      )}
                      {role === "admin" && m.user_id === server?.owner_id && isCurrentUser && (
                        <Star className="h-3 w-3 shrink-0 text-amber-400" />
                      )}
                    </button>

                    {/* Tooltip */}
                    {!m.is_online && (
                      <div className="pointer-events-none absolute left-10 top-1 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                        Son: {m.last_seen_at ? new Date(m.last_seen_at).toLocaleString("tr-TR") : "bilinmiyor"}
                      </div>
                    )}
                  </div>
                )})}
              </div>
            );
          })}

          {canManage && mutedMembers.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 flex items-center gap-1 px-1 text-xs font-semibold uppercase text-muted-foreground">
                <VolumeX className="h-3 w-3 text-destructive" />
                Susturulan Kullanicilar - {mutedMembers.length}
              </p>
              {mutedMembers.map((m) => {
                const isCurrentUser = m.user_id === user?.id;
                const remaining = getRemainingMuteText(m.mute_until);

                return (
                  <div key={m.user_id} className="group relative">
                    <button
                      onClick={() =>
                        canManage && !isCurrentUser
                          ? setSelectedMember(m)
                          : undefined
                      }
                      className={cn(
                        "mb-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground",
                        "bg-amber-500/10 hover:bg-amber-500/20",
                        canManage && !isCurrentUser && "cursor-pointer",
                      )}
                    >
                      <div className="relative h-8 w-8">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-xs font-semibold text-amber-300">
                          {m.user?.username?.slice(0, 2).toUpperCase() || "??"}
                        </div>
                      </div>
                      <span className="flex-1 truncate">
                        {m.user?.username || "Bilinmeyen"}
                      </span>
                      <span className="ml-2 rounded bg-destructive/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        Susturuldu
                      </span>
                    </button>

                    {remaining && (
                      <div className="px-2 pb-1 text-[10px] text-muted-foreground">
                        Kalan sure: {remaining}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {myRole === "admin" && sortedBannedMembers.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 flex items-center gap-1 px-1 text-xs font-semibold uppercase text-muted-foreground">
                <ShieldAlert className="h-3 w-3 text-destructive" />
                Banlanmis Kullanicilar - {sortedBannedMembers.length}
              </p>
              {sortedBannedMembers.map((m) => {
                const isCurrentUser = m.user_id === user?.id;
                return (
                  <div key={m.user_id} className="group relative">
                    <button
                      onClick={() =>
                        canManage && !isCurrentUser
                          ? setSelectedMember(m)
                          : undefined
                      }
                      className={cn(
                        "mb-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground",
                        "bg-destructive/10 hover:bg-destructive/20",
                        canManage && !isCurrentUser && "cursor-pointer",
                      )}
                    >
                      <div className="relative h-8 w-8">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/20 text-xs font-semibold text-destructive">
                          {m.user?.username?.slice(0, 2).toUpperCase() || "??"}
                        </div>
                      </div>
                      <span className="flex-1 truncate">
                        {m.user?.username || "Bilinmeyen"}
                      </span>
                      <span className="ml-2 rounded bg-destructive/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        Banli
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedMember && (
        <MemberManageDialog
          open={!!selectedMember}
          onOpenChange={(v) => !v && setSelectedMember(null)}
          member={selectedMember}
          serverId={serverId}
          myRole={myRole}
          onUpdated={refreshMembers}
        />
      )}
    </aside>
  );
}

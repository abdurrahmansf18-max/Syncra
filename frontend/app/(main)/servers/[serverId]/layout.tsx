"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChannelSidebar } from "@/components/layout/channel-sidebar";
import { MemberList } from "@/components/layout/member-list";
import { BanAlert } from "@/components/server/ban-alert";
import { API_BASE_URL, WS_BASE_URL } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Menu, Users } from "lucide-react";
import { buildApiError } from "@/lib/api";

export default function ServerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const router = useRouter();
  const { token, user } = useAuth();
  const serverId = params?.serverId as string;
  const [banInfo, setBanInfo] = useState<{ reason: string } | null>(null);
  const [deletedInfo, setDeletedInfo] = useState<{ name: string } | null>(null);
  const [channelSidebarOpen, setChannelSidebarOpen] = useState(false);
  const [desktopChannelSidebarOpen, setDesktopChannelSidebarOpen] = useState(true);
  const [memberListOpen, setMemberListOpen] = useState(false);
  const [serverName, setServerName] = useState<string>("");
  const [serverLoadError, setServerLoadError] = useState<string | null>(null);

  // Fetch server name
  useEffect(() => {
    if (!serverId || !token) return;
    setServerLoadError(null);
    fetch(`${API_BASE_URL}/servers/${serverId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw buildApiError(res.status, body);
        }
        return body;
      })
      .then((data) => setServerName(data?.name ?? ""))
      .catch((err) => {
        const message =
          err instanceof Error
            ? err.message
            : "Sunucu bilgileri yüklenemedi.";
        setServerLoadError(message);
      });
  }, [serverId, token]);

  // Server-wide WebSocket for ban events & online status
  useEffect(() => {
    if (!token || !serverId || !user) return;

    const wsUrl = `${WS_BASE_URL}/ws/server/${serverId}?token=${encodeURIComponent(token)}`;
    console.log('Connecting to WebSocket:', wsUrl);
    
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected to server:', serverId);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket message:', data);

        // Handle user banned event
        if (data.type === "user_banned" && data.data.user_id === user.id) {
          setBanInfo({ reason: data.data.reason });
          window.dispatchEvent(new Event("serverListUpdated"));
        }

        // Handle online/offline status changes
        if (data.type === "user_online_status_changed") {
          window.dispatchEvent(
            new CustomEvent("userOnlineStatusChanged", {
              detail: data.data,
            }),
          );
        }

        if (data.type === "member_updated") {
          window.dispatchEvent(
            new CustomEvent("memberUpdated", {
              detail: data.data,
            }),
          );
        }

        if (data.type === "report_changed") {
          window.dispatchEvent(
            new CustomEvent("reportChanged", {
              detail: data.data,
            }),
          );
        }

        if (data.type === "channel_list_changed") {
          window.dispatchEvent(
            new CustomEvent("channelListChanged", {
              detail: data.data,
            }),
          );
        }

        if (data.type === "server_deleted") {
          // Tell ServerList via window event
          window.dispatchEvent(new Event("serverUpdated"));
          
          const sName = data.data?.name || "Sunucu";
          setDeletedInfo({ name: sName });
          
          // Redirect after delay
          setTimeout(() => {
            router.push("/servers");
          }, 3000);
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = (error) => {
      console.warn('WebSocket warning:', error);
    };
    
    ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
    };

    return () => {
      ws.close();
    };
  }, [token, serverId, user]);

  useEffect(() => {
    const handleOpenSidebar = () => {
      setChannelSidebarOpen(true);
    };
    const handleOpenMemberList = () => {
      setMemberListOpen(true);
    };

    window.addEventListener("openServerSidebar", handleOpenSidebar);
    window.addEventListener("openMemberList", handleOpenMemberList);
    return () => {
      window.removeEventListener("openServerSidebar", handleOpenSidebar);
      window.removeEventListener("openMemberList", handleOpenMemberList);
    };
  }, []);

  if (deletedInfo) {
    return (
      <BanAlert
        title="Sunucu Silindi"
        message={`${deletedInfo.name} sunucusu sahibi tarafından silindi.`}
        reason="Ana sayfaya yönlendiriliyorsunuz..."
        onReturn={() => router.push("/servers")}
        returnButtonText="Şimdi Dön"
      />
    );
  }

  if (banInfo) {
    return (
      <BanAlert
        reason={banInfo.reason}
        onReturn={() => router.push("/servers")}
      />
    );
  }

  return (
    <div className="relative flex flex-1 overflow-hidden">
      {/* Desktop Channel Sidebar */}
      {desktopChannelSidebarOpen && (
        <div className="relative hidden md:flex">
          <ChannelSidebar />
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setDesktopChannelSidebarOpen(false)}
            className="absolute -right-3 top-1/2 z-20 h-7 w-7 -translate-y-1/2 rounded-full border border-border bg-card shadow-sm"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {!desktopChannelSidebarOpen && (
        <div className="absolute left-0 top-1/2 z-20 hidden -translate-y-1/2 md:block">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setDesktopChannelSidebarOpen(true)}
            className="h-8 w-8 rounded-r-full rounded-l-none border border-l-0 border-border bg-card shadow-sm"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Mobile Channel Sidebar */}
      <Sheet open={channelSidebarOpen} onOpenChange={setChannelSidebarOpen}>
        <SheetContent side="left" className="h-full w-60 overflow-hidden p-0 md:hidden" hideClose>
          <SheetHeader className="sr-only">
            <SheetTitle>Kanallar</SheetTitle>
          </SheetHeader>
          <ChannelSidebar onItemClick={() => setChannelSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Mobile Member List */}
      <Sheet open={memberListOpen} onOpenChange={setMemberListOpen}>
        <SheetContent side="right" className="h-full w-60 overflow-hidden p-0 lg:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Üyeler</SheetTitle>
          </SheetHeader>
          <MemberList variant="mobile" />
        </SheetContent>
      </Sheet>

      <main className="flex flex-1 flex-col overflow-hidden bg-secondary">
        {serverLoadError && (
          <div className="mx-3 mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive md:mx-4 md:mt-4 md:text-sm">
            {serverLoadError}
          </div>
        )}

        {children}
      </main>

      {/* Desktop Member List */}
      <div className="hidden lg:flex">
        <MemberList />
      </div>
    </div>
  );
}

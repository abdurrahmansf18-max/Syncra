"use client";

import { usePathname, useRouter, useParams } from "next/navigation";
import { Compass, Hash, Menu, MessageCircle, User, Users, AlignLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

interface MobileNavProps {
  onOpenServerList: () => void;
}

export function MobileNav({
  onOpenServerList,
}: MobileNavProps) {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  
  const serverId = params?.serverId as string | undefined;
  const isServerView = !!serverId;

  const handleOpenChannelList = () => {
      window.dispatchEvent(new CustomEvent("openServerSidebar"));
  };

  const handleOpenMemberList = () => {
      window.dispatchEvent(new CustomEvent("openMemberList"));
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-border bg-background/95 px-2 backdrop-blur-lg md:hidden pb-safe shadow-[0_-1px_10px_rgba(0,0,0,0.3)]">
      <Button
        variant="ghost"
        className="flex h-full flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 hover:bg-white/5 active:scale-95 transition-all text-muted-foreground hover:text-foreground"
        onClick={onOpenServerList}
      >
        <div className="relative">
          <AlignLeft className="h-5 w-5" />
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground animate-pulse" />
        </div>
        <span className="text-[10px] font-medium">Sunucular</span>
      </Button>

      {isServerView && (
        <Button
          variant="ghost"
          className="flex h-full flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 hover:bg-white/5 active:scale-95 transition-all text-muted-foreground hover:text-foreground"
          onClick={handleOpenChannelList}
        >
          <Hash className="h-5 w-5" />
          <span className="text-[10px] font-medium">Kanallar</span>
        </Button>
      )}

      <Button
        variant="ghost" 
        className={cn(
           "flex h-full flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 active:scale-95 transition-all -mt-6",
        )}
        onClick={() => router.push("/servers")}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-[0_4px_14px_rgba(99,102,241,0.5)] border-4 border-background transition-transform active:scale-90">
             <img src="/logo.svg" alt="Home" className="h-7 w-7" />
        </div>
      </Button>

      {isServerView && (
        <Button
          variant="ghost"
          className="flex h-full flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 hover:bg-white/5 active:scale-95 transition-all text-muted-foreground hover:text-foreground"
          onClick={handleOpenMemberList}
        >
          <Users className="h-5 w-5" />
          <span className="text-[10px] font-medium">Üyeler</span>
        </Button>
      )}

      <Button
        variant="ghost"
        className={cn(
          "flex h-full flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 hover:bg-white/5 active:scale-95 transition-all text-muted-foreground hover:text-foreground",
          pathname === "/settings" && "text-primary"
        )}
        onClick={() => router.push("/settings")}
      >
         {user?.username ? (
            <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-[9px] font-bold text-white shadow-sm ring-1 ring-border/50">
              {user.username.slice(0, 2).toUpperCase()}
               <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
            </div>
         ) : (
           <User className="h-5 w-5" />
         )}
         <span className="text-[10px] font-medium">Profil</span>
      </Button>
    </div>
  );
}

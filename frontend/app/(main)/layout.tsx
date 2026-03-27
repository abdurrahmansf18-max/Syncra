"use client"

import { useEffect } from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { ServerList } from "@/components/layout/server-list"
import { Button } from "@/components/ui/button"
import { ChevronRight, ChevronLeft } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { VoiceProvider } from "@/lib/voice-context"

import { MobileNav } from "@/components/layout/mobile-nav"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [desktopServerListOpen, setDesktopServerListOpen] = useState(true)
  const [mobileServerListOpen, setMobileServerListOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login")
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) return null

  return (
    <VoiceProvider>
    <div className="relative flex h-screen overflow-hidden bg-background">
      {/* Mobile Server List (Sheet) */}
      <Sheet open={mobileServerListOpen} onOpenChange={setMobileServerListOpen}>
        <SheetContent side="left" className="h-full w-[300px] border-r-0 bg-transparent p-0 shadow-none md:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Sunucular</SheetTitle>
          </SheetHeader>
          <div className="flex h-full">
            <ServerList onToggle={() => setMobileServerListOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Server List */}
      {desktopServerListOpen && (
        <div className="relative hidden h-full md:flex">
          <ServerList />
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setDesktopServerListOpen(false)}
            className="absolute -right-3 top-1/2 z-50 h-6 w-6 -translate-y-1/2 rounded-full border border-border shadow-sm"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Desktop Open Button */}
      {!desktopServerListOpen && (
        <div className="absolute left-0 top-1/2 z-50 hidden -translate-y-1/2 md:block">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setDesktopServerListOpen(true)}
            className="h-8 w-8 rounded-l-none rounded-r-full border border-l-0 border-border bg-card shadow-sm"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Mobile Navigation Bar */}
      <MobileNav onOpenServerList={() => setMobileServerListOpen(true)} />

      <div className="flex flex-1 overflow-hidden pb-16 md:pb-0">{children}</div>
    </div>
    </VoiceProvider>
  )
}

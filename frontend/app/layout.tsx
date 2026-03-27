import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { AuthProvider } from "@/lib/auth-context"
import { GlobalToast } from "@/components/layout/global-toast"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

export const metadata: Metadata = {
  title: "Syncra - Community Platform",
  description:
    "Sunucu tabanli topluluk platformu. Kanallar, roller, moderasyon ve sesli odalar.",
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: "#1a1b20",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="tr" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <AuthProvider>
          <GlobalToast />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}

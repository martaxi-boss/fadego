import type { Metadata } from "next"
import type { ReactNode } from "react"
import "@/app/globals.css"

export const metadata: Metadata = {
  title: "FADEGO",
  description: "Plataforma de gestão autónoma para barbearias.",
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  )
}

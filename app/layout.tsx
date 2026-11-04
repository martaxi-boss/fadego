import type { Metadata } from "next"
import type { ReactNode } from "react"
import "@/app/globals.css"

export const metadata: Metadata = {
  title: "FADEGO — A tua barbearia. À tua maneira.",
  description: "Gestão de barbearias: agenda, marcações sem conta e fidelização num espaço pensado para a tua equipa.",
  icons: { icon: "/fadego-mark.webp" },
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  )
}

import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import SignOutButton from "@/app/_components/sign-out-button"
import AdminNavigation from "@/app/_components/admin-navigation"

interface NavigationItem {
  href: string
  label: string
}

interface AdminShellProps {
  scopeLabel: string
  heading: string
  children: ReactNode
  homeHref: string
  navigation?: NavigationItem[]
}

export default function AdminShell({
  scopeLabel,
  heading,
  children,
  homeHref,
  navigation,
}: AdminShellProps) {
  const items = navigation ?? [{ href: homeHref, label: "Visão geral" }]

  return (
    <div className="min-h-screen bg-[#f6f8f4]">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-[#183c2c] focus:shadow-lg">
        Saltar para o conteúdo
      </a>
      <header className="border-b border-[#e2e9e2] bg-white/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-7">
          <div>
            <Link className="inline-flex items-center gap-2.5 text-xl font-black tracking-[-0.06em] text-[#183c2e]" href={homeHref}>
              <Image src="/fadego-mark.svg" alt="" width={40} height={40} className="size-10 rounded-xl" />
              FADEGO
            </Link>
            <p className="mt-1 text-xs font-semibold text-[#718275]">{scopeLabel}</p>
          </div>
          <SignOutButton />
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-7 lg:grid-cols-[235px_minmax(0,1fr)] lg:gap-8 lg:py-8">
        <aside className="h-fit min-w-0 rounded-2xl border border-[#e1e8e1] bg-white p-4 shadow-sm">
          <p className="px-3 py-2 text-sm font-bold text-[#223c31]">{heading}</p>
          <AdminNavigation items={items} homeHref={homeHref} />
        </aside>
        <main id="admin-main" tabIndex={-1} className="min-w-0">{children}</main>
      </div>
    </div>
  )
}

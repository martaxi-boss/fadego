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
    <div className="min-h-screen bg-[#f4f7fb]">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-slate-900 focus:shadow-lg">
        Saltar para o conteúdo
      </a>
      <header className="border-b border-slate-200 bg-white/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-7">
          <div>
            <Link className="inline-flex items-center gap-2 text-xl font-black tracking-tight text-slate-950" href={homeHref}>
              <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-slate-950 text-base text-teal-300">F</span>
              FADEGO
            </Link>
            <p className="mt-1 text-xs font-semibold text-slate-500">{scopeLabel}</p>
          </div>
          <SignOutButton />
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-7 lg:grid-cols-[235px_minmax(0,1fr)] lg:gap-8 lg:py-8">
        <aside className="min-w-0 h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="px-3 py-2 text-sm font-bold text-slate-900">{heading}</p>
          <AdminNavigation items={items} homeHref={homeHref} />
        </aside>
        <main id="admin-main" tabIndex={-1} className="min-w-0">{children}</main>
      </div>
    </div>
  )
}

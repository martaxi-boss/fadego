import Link from "next/link"
import type { ReactNode } from "react"
import SignOutButton from "@/app/_components/sign-out-button"

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
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-7 lg:grid-cols-[235px_minmax(0,1fr)] lg:gap-8 lg:py-8">
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="px-3 py-2 text-sm font-bold text-slate-900">{heading}</p>
          <nav aria-label="Gestão" className="mt-2 flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {items.map((item) => (
              <Link
                className="shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-teal-50 hover:text-teal-900"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}

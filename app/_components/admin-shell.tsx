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
  const items =
    navigation ?? [{ href: homeHref, label: "Visão geral" }]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <div>
            <Link className="text-lg font-semibold tracking-tight" href={homeHref}>
              FADEGO
            </Link>
            <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.16em] text-gray-500">
              {scopeLabel}
            </p>
          </div>
          <SignOutButton />
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[220px_1fr]">
        <aside className="h-fit rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold">{heading}</p>
          <nav className="mt-4 space-y-1">
            {items.map((item) => (
              <Link
                className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-100"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  )
}

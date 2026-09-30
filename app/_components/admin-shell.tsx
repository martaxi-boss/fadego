import Link from "next/link"
import type { ReactNode } from "react"
import SignOutButton from "@/app/_components/sign-out-button"

interface AdminShellProps {
  scopeLabel: string
  heading: string
  children: ReactNode
  homeHref: string
}

export default function AdminShell({
  scopeLabel,
  heading,
  children,
  homeHref,
}: AdminShellProps) {
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
        <aside className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold">{heading}</p>
          <nav className="mt-4">
            <Link
              className="block rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium"
              href={homeHref}
            >
              Visão geral
            </Link>
          </nav>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  )
}

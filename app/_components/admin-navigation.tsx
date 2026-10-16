"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

type Item = { href: string; label: string }

export default function AdminNavigation({
  items,
  homeHref,
}: {
  items: readonly Item[]
  homeHref: string
}) {
  const pathname = usePathname()

  return (
    <nav aria-label="Navegação administrativa" className="mt-2 flex w-full min-w-0 max-w-full gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== homeHref && pathname.startsWith(item.href + "/"))
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              "shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors " +
              (active
                ? "bg-teal-50 text-teal-900 ring-1 ring-inset ring-teal-200"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950")
            }
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

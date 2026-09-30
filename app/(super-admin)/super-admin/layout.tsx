import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import AdminShell from "@/app/_components/admin-shell"
import { AuthorizationError } from "@/lib/access-policy"
import { requireSuperAdmin } from "@/lib/authorization"

export default async function SuperAdminLayout({
  children,
}: {
  children: ReactNode
}) {
  try {
    await requireSuperAdmin()
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/login")
    }
    throw error
  }

  return (
    <AdminShell
      heading="FADEGO Super Admin"
      homeHref="/super-admin"
      scopeLabel="Plataforma"
    >
      {children}
    </AdminShell>
  )
}

import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import AdminShell from "@/app/_components/admin-shell"
import { AuthorizationError } from "@/lib/access-policy"
import { requireBarbershopBySlug } from "@/lib/authorization"

export default async function TenantAdminLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  let access

  try {
    access = await requireBarbershopBySlug(slug, ["OWNER", "ADMIN", "STAFF"])
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/admin")
    }
    throw error
  }

  const { barbershop, membership } = access

  return (
    <AdminShell
      heading={barbershop.name}
      homeHref={`/admin/${barbershop.slug}`}
      scopeLabel={`${barbershop.slug}.fadego.pt · ${membership.role}`}
    >
      {children}
    </AdminShell>
  )
}

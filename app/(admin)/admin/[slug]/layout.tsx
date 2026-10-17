import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import AdminShell from "@/app/_components/admin-shell"
import { AuthorizationError } from "@/lib/access-policy"
import { requireBarbershopBySlug } from "@/lib/authorization"
import { tenantModulesForRole } from "@/lib/admin-navigation"

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
  const homeHref = `/admin/${barbershop.slug}`

  return (
    <AdminShell
      heading={barbershop.name}
      homeHref={homeHref}
      navigation={[
        { href: homeHref, label: "Visão geral" },
        ...tenantModulesForRole(membership.role).map((module) => ({
          href: `${homeHref}/${module.href}`,
          label: module.label,
        })),
      ]}
      scopeLabel={`${barbershop.slug} · ${membership.role}`}
    >
      {children}
    </AdminShell>
  )
}

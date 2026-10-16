import Link from "next/link"
import { requireBarbershopBySlug } from "@/lib/authorization"
import { tenantModulesForRole } from "@/lib/admin-navigation"

export default async function TenantOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const access = await requireBarbershopBySlug(slug, [
    "OWNER",
    "ADMIN",
    "STAFF",
  ])
  const modules = tenantModulesForRole(access.membership.role)

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Visão geral</h1>
        <p className="mt-3 max-w-2xl leading-7 text-gray-600">
          Gestão diária de {access.barbershop.name}: marcações, equipa, cadeiras,
          serviços, horários e Club. A cobrança online ainda não está ativa.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {modules.map((module) => (
          <Link
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-gray-300"
            href={`/admin/${access.barbershop.slug}/${module.href}`}
            key={module.href}
          >
            <h2 className="font-semibold">{module.label}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              {module.detail}
            </p>
          </Link>
        ))}
      </section>
    </div>
  )
}

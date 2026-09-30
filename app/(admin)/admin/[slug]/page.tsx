import Link from "next/link"
import { requireBarbershopBySlug } from "@/lib/authorization"

const modules = [
  {
    href: "professionals",
    label: "Profissionais",
    detail: "Identidade operacional, fotografia e ciclo de vida.",
  },
  {
    href: "chairs",
    label: "Cadeiras",
    detail: "Até cinco cadeiras e modos Walk-in, Reserva geral ou profissional.",
  },
  {
    href: "services",
    label: "Serviços",
    detail: "Preço, duração em grelha de 15 minutos e ativação.",
  },
  {
    href: "hours",
    label: "Horários",
    detail: "Horário semanal geral da barbearia.",
  },
] as const

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

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Visão geral</h1>
        <p className="mt-3 max-w-2xl leading-7 text-gray-600">
          Configuração operacional autónoma de {access.barbershop.name}.
          Reservas, capacidade, clientes, Club e pagamentos ainda não fazem
          parte desta gate.
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

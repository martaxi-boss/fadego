import Link from "next/link"
import { db } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export default async function SuperAdminPage() {
  const [shops, activeShops, bookings, customers, clubMembers, activeSubscriptions, recentShops] =
    await Promise.all([
      db.barbershop.count(),
      db.barbershop.count({ where: { status: "ACTIVE" } }),
      db.booking.count(),
      db.customer.count(),
      db.membership.count(),
      db.platformSubscription.count({ where: { status: "ACTIVE" } }),
      db.barbershop.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
          _count: { select: { bookings: true, customers: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 12,
      }),
    ])

  const metrics = [
    { label: "Barbearias", value: shops },
    { label: "Ativas", value: activeShops },
    { label: "Marcações", value: bookings },
    { label: "Clientes", value: customers },
    { label: "Adesões Club", value: clubMembers },
    { label: "Subscrições SaaS ativas", value: activeSubscriptions },
  ]

  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-lg sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Administração da plataforma</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Visão geral FADEGO</h1>
        <p className="mt-2 text-sm text-slate-300">
          Indicadores reais da base de dados. Sem efeitos financeiros nem operações sobre outras barbearias.
        </p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{metric.label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{metric.value.toLocaleString("pt-PT")}</p>
          </div>
        ))}
      </section>
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Barbearias recentes</h2>
        <p className="mt-1 text-sm text-slate-500">Vista de consulta, sem gestão remota de contas.</p>
        <div className="mt-5 divide-y divide-gray-100">
          {recentShops.map((shop) => (
            <div key={shop.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold text-slate-900">{shop.name}</p>
                <p className="text-xs text-gray-500">{shop.slug} · {shop.status}</p>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                <span>{shop._count.bookings} marcações</span>
                <span>{shop._count.customers} clientes</span>
                <Link className="text-teal-700 underline underline-offset-2" href={"/b/" + shop.slug}>
                  Página pública
                </Link>
              </div>
            </div>
          ))}
          {recentShops.length === 0 ? <p className="py-6 text-sm text-slate-500">Ainda não existem barbearias registadas.</p> : null}
        </div>
      </section>
      <p className="text-xs text-slate-500">
        O processamento real de subscrições, onboarding de comerciantes e faturação ficam desativados até existir fornecedor aprovado.
      </p>
    </div>
  )
}

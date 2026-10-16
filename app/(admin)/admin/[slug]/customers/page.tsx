import { requireBarbershopBySlug } from "@/lib/authorization"
import { db } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const text = (value?: string | string[]) =>
  typeof value === "string" ? value.trim().slice(0, 80) : ""

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const { slug } = await params
  const filters = await searchParams
  const access = await requireBarbershopBySlug(slug, ["OWNER", "ADMIN", "STAFF"])
  const q = text(filters.q)
  const where = {
    barbershopId: access.barbershop.id,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  }
  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        createdAt: true,
        _count: { select: { bookings: true, memberships: true } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 60,
    }),
    db.customer.count({ where }),
  ])

  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-lg sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Relação com clientes</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Clientes</h1>
        <p className="mt-2 text-sm text-slate-300">Apenas dados da tua barbearia, com histórico de marcações e Club.</p>
      </header>
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <form action={"/admin/" + access.barbershop.slug + "/customers"}
          className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
            Procurar por nome, telefone ou email
            <input type="search" name="q" defaultValue={q} maxLength={80}
              placeholder="Pesquisar clientes"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"/>
          </label>
          <button type="submit" className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white">
            Pesquisar
          </button>
        </form>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{total} clientes encontrados</h2>
        {customers.map((customer) => (
          <article key={customer.id}
            className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900">{customer.name}</h3>
              <p className="mt-1 text-sm text-slate-600">{customer.phone}</p>
              {customer.email ? <p className="mt-1 break-all text-sm text-slate-500">{customer.email}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
                {customer._count.bookings} marcações
              </span>
              <span className="rounded-full bg-teal-50 px-3 py-1.5 text-teal-800">
                {customer._count.memberships} adesões Club
              </span>
            </div>
          </article>
        ))}
        {customers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            Não existem clientes para esta pesquisa.
          </div>
        ) : null}
        {total > customers.length ? (
          <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
            A mostrar os primeiros {customers.length} clientes. Refina a pesquisa para encontrar os restantes.
          </p>
        ) : null}
      </section>
    </div>
  )
}

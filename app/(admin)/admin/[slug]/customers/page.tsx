import { notFound } from "next/navigation"
import { AuthorizationError } from "@/lib/access-policy"
import { requireBarbershopBySlug } from "@/lib/authorization"
import { db } from "@/lib/prisma"
import { resolveDirectoryPage } from "@/lib/admin-pagination"

export const dynamic = "force-dynamic"

const text = (value?: string | string[]) =>
  typeof value === "string" ? value.trim().slice(0, 80) : ""

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>
}) {
  const { slug } = await params
  const filters = await searchParams
  // Customer directory is not a general STAFF access surface.
  let access
  try {
    access = await requireBarbershopBySlug(slug, ["OWNER", "ADMIN"])
  } catch (error) {
    if (error instanceof AuthorizationError) notFound()
    throw error
  }
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
  const total = await db.customer.count({ where })
  const pagination = resolveDirectoryPage(filters.page, total)
  const customers = await db.customer.findMany({
    where,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      _count: { select: { bookings: true, memberships: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: pagination.skip,
    take: pagination.take,
  })
  const pageHref = (page: number) => {
    const params = new URLSearchParams({ page: String(page) })
    if (q) params.set("q", q)
    return "/admin/" + access.barbershop.slug + "/customers?" + params.toString()
  }

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
        {total > 0 ? (
          <nav aria-label="Páginas de clientes"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-sm shadow-sm">
            <p className="text-slate-600">
              A mostrar {pagination.first}–{pagination.last} de {total} clientes
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {pagination.hasPrevious ? (
                <a href={pageHref(pagination.page - 1)}
                  className="rounded-lg border border-gray-300 px-3 py-2 font-semibold hover:bg-slate-50">
                  ← Anterior
                </a>
              ) : null}
              <span aria-current="page" className="rounded-lg bg-slate-950 px-3 py-2 font-semibold text-white">
                Página {pagination.page} de {pagination.totalPages}
              </span>
              {pagination.hasNext ? (
                <a href={pageHref(pagination.page + 1)}
                  className="rounded-lg border border-gray-300 px-3 py-2 font-semibold hover:bg-slate-50">
                  Seguinte →
                </a>
              ) : null}
            </div>
            {pagination.totalPages > pagination.lastPage ? (
              <p className="w-full text-xs text-amber-800">
                Existem mais resultados do que o limite de navegação. Refina a pesquisa para os encontrar.
              </p>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  )
}

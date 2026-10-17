import Link from "next/link"
import { requireSuperAdmin } from "@/lib/authorization"
import { db } from "@/lib/prisma"
import { createPlatformShopAction } from "../actions"

export const dynamic = "force-dynamic"

const notices: Record<string, string> = {
  invalid: "Confere os campos da conta.",
  duplicate: "Já existe um registo com estes dados.",
  "rate-limit": "Demasiadas alterações. Tenta mais tarde.",
  failed: "Não foi possível concluir a operação.",
}

export default async function PlatformShopsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; notice?: string }>
}) {
  await requireSuperAdmin()
  const query = await searchParams
  const page = /^[1-9][0-9]{0,3}$/.test(query.page ?? "1")
    ? Number(query.page ?? "1") : 1
  const term = (query.q ?? "").trim().slice(0, 60)
  const where = term.length >= 2 ? {
    OR: [
      { name: { contains: term, mode: "insensitive" as const } },
      { slug: { contains: term, mode: "insensitive" as const } },
    ],
  } : {}
  const [total, shops] = await Promise.all([
    db.barbershop.count({ where }),
    db.barbershop.findMany({
      where,
      select: {
        id: true, name: true, slug: true, status: true,
        _count: { select: { members: true, chairs: true, services: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
    }),
  ])
  const href = (p: number) =>
    "/super-admin/barbearias?page=" + p + (term ? "&q=" + encodeURIComponent(term) : "")
  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-slate-950 px-6 py-7 text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-teal-300">Portal FADEGO · Plataforma</p>
        <h1 className="mt-2 text-3xl font-semibold">Gestão das barbearias</h1>
        <p className="mt-2 text-sm text-slate-300">
          Contas independentes, proprietários e permissões. Sem envios reais ou pagamentos.
        </p>
      </header>
      {query.notice && notices[query.notice] ? (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {notices[query.notice]}
        </p>
      ) : null}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Criar barbearia</h2>
        <p className="mt-2 text-sm text-gray-600">
          A nova barbearia fica suspensa. O proprietário indicado fica associado sem acesso
          até à verificação da identidade e configuração das próprias credenciais.
        </p>
        <form action={createPlatformShopAction} className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">Nome do negócio
            <input name="name" maxLength={120} required
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <label className="text-sm font-semibold">Identificador da página
            <input name="slug" maxLength={63} pattern="[a-z0-9]+(-[a-z0-9]+)*" required
              placeholder="barbearia-exemplo"
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <label className="text-sm font-semibold">Email do proprietário
            <input type="email" name="ownerEmail" maxLength={254} required autoComplete="off"
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <label className="text-sm font-semibold">Email público do negócio (facultativo)
            <input type="email" name="contactEmail" maxLength={254}
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <div className="md:col-span-2">
            <button type="submit" className="rounded-lg bg-[#153e30] px-5 py-3 text-sm font-bold text-white">
              Criar barbearia suspensa
            </button>
          </div>
        </form>
      </section>
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Barbearias ({total})</h2>
          <form action="/super-admin/barbearias" className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-semibold">Pesquisar por nome ou URL
              <input name="q" defaultValue={term} maxLength={60}
                className="mt-1 block w-full rounded-lg border border-gray-300 p-2" />
            </label>
            <button type="submit" className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Pesquisar</button>
          </form>
        </div>
        <div className="mt-4 divide-y divide-gray-100">
          {shops.map((shop) => (
            <div key={shop.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="font-semibold">{shop.name}</p>
                <p className="mt-1 break-all text-xs text-gray-600">{shop.slug} · {shop.status}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {shop._count.members} contas · {shop._count.chairs} cadeiras · {shop._count.services} serviços
                </p>
              </div>
              <Link className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-900"
                href={"/super-admin/barbearias/" + shop.id}>
                Administrar conta →
              </Link>
            </div>
          ))}
          {shops.length === 0 ? <p className="py-6 text-sm text-gray-600">Sem resultados.</p> : null}
        </div>
        <nav aria-label="Paginação das barbearias" className="mt-5 flex justify-between gap-4 text-sm">
          {page > 1 ? <Link href={href(page - 1)} className="underline">← Anterior</Link> : <span />}
          <span>Página {page}</span>
          {page * 20 < total ? <Link href={href(page + 1)} className="underline">Seguinte →</Link> : <span />}
        </nav>
      </section>
    </div>
  )
}

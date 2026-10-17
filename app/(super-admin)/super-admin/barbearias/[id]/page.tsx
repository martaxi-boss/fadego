import Link from "next/link"
import { notFound } from "next/navigation"
import { db } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/authorization"
import { platformIdSchema } from "@/lib/platform-account-policy"
import {
  editPlatformShopAction, linkPlatformMemberAction,
  setPlatformMemberAccessAction, setPlatformShopStatusAction,
} from "../../actions"

export const dynamic = "force-dynamic"

const notices: Record<string, string> = {
  created: "Barbearia criada em segurança, com acesso suspenso.",
  saved: "Alteração guardada.",
  invalid: "Dados inválidos. Nenhuma alteração efetuada.",
  duplicate: "A conta ou permissão já existe.",
  "not-ready": "Antes de ativar: proprietário com acesso ativo, serviços, cadeiras e horários.",
  "identity-not-ready": "A identidade ainda não pode entrar. É necessário confirmar o acesso próprio.",
  "already-member": "Esta pessoa já pertence a esta barbearia.",
  "last-owner": "Não é possível suspender o último proprietário de uma barbearia ativa.",
  archived: "Conta arquivada. O histórico fica preservado.",
  missing: "Registo não encontrado.",
  "rate-limit": "Demasiadas alterações. Tenta novamente mais tarde.",
  failed: "Não foi possível concluir. Confere o estado antes de tentar novamente.",
}

export default async function PlatformShopDetailsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ notice?: string }>
}) {
  await requireSuperAdmin()
  const { id } = await params
  const query = await searchParams
  if (!platformIdSchema.safeParse(id).success) notFound()
  const shop = await db.barbershop.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: { select: { id: true, email: true, name: true, active: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { chairs: true, services: true, openingHours: true } },
    },
  })
  if (!shop) notFound()
  const archived = shop.status === "ARCHIVED"
  const editAction = editPlatformShopAction.bind(null, id)
  const statusAction = setPlatformShopStatusAction.bind(null, id)
  const linkAction = linkPlatformMemberAction.bind(null, id)
  return (
    <div className="space-y-6">
      <Link href="/super-admin/barbearias" className="text-sm font-semibold text-teal-800 underline">
        ← Voltar às barbearias
      </Link>
      <header className="rounded-3xl bg-slate-950 px-6 py-7 text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-teal-300">Conta de negócio · {shop.status}</p>
        <h1 className="mt-2 text-3xl font-semibold">{shop.name}</h1>
        <p className="mt-2 break-all text-sm text-slate-300">/b/{shop.slug}</p>
        <p className="mt-2 text-sm text-slate-300">
          {shop._count.chairs} cadeiras · {shop._count.services} serviços · {shop._count.openingHours} horários
        </p>
      </header>
      {query.notice && notices[query.notice] ? (
        <p role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
          {notices[query.notice]}
        </p>
      ) : null}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Dados do negócio</h2>
        <form action={editAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">Nome
            <input name="name" maxLength={120} defaultValue={shop.name} required disabled={archived}
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <label className="text-sm font-semibold">Email de contacto
            <input name="contactEmail" type="email" maxLength={254} disabled={archived}
              defaultValue={shop.contactEmail ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <div className="md:col-span-2">
            <button type="submit" disabled={archived}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              Guardar dados
            </button>
          </div>
        </form>
      </section>
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Estado do negócio</h2>
        <p className="mt-2 text-sm text-gray-600">
          Suspender mantém o histórico. Ativar exige responsável autenticável e uma configuração
          mínima de serviços, cadeiras e horários. Isto não ativa Gmail nem pagamentos.
        </p>
        <form action={statusAction} className="mt-4">
          <input type="hidden" name="status" value={shop.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
          <button type="submit" disabled={archived}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">
            {shop.status === "ACTIVE" ? "Suspender barbearia" : "Ativar barbearia"}
          </button>
        </form>
      </section>
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Pessoas com acesso</h2>
        <p className="mt-2 text-sm text-gray-600">
          Acesso limitado por negócio. Uma conta nova fica sem acesso até a identidade estar
          devidamente ativada; não é gerada nenhuma password conhecida pela plataforma.
        </p>
        <div className="mt-5 divide-y divide-gray-100">
          {shop.members.map((member) => {
            const canEnable = member.user.active && member.revokedAt === null
            const toggle = setPlatformMemberAccessAction.bind(null, id, member.id)
            return (
              <article key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="break-all text-sm font-semibold">{member.user.email}</p>
                  <p className="mt-1 text-xs text-gray-600">
                    {member.role} · {member.active ? "Acesso ativo" : "Acesso suspenso"} ·
                    {member.user.active ? " Identidade ativa" : " Identidade pendente"}
                  </p>
                </div>
                {!archived && (member.active || canEnable) ? (
                  <form action={toggle}>
                    <input type="hidden" name="active" value={member.active ? "false" : "true"} />
                    <button type="submit" className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      {member.active ? "Suspender acesso" : "Ativar acesso"}
                    </button>
                  </form>
                ) : null}
              </article>
            )
          })}
        </div>
        {!archived ? (
          <form action={linkAction} className="mt-5 grid gap-4 border-t border-gray-100 pt-5 md:grid-cols-2">
            <label className="text-sm font-semibold">Email de utilizador já ativo
              <input type="email" name="email" maxLength={254} autoComplete="off" required
                className="mt-1 block w-full rounded-lg border border-gray-300 p-3" />
            </label>
            <label className="text-sm font-semibold">Permissão nesta barbearia
              <select name="role" className="mt-1 block w-full rounded-lg border border-gray-300 p-3">
                <option value="OWNER">Proprietário</option>
                <option value="ADMIN">Administrador</option>
                <option value="STAFF">Funcionário</option>
              </select>
            </label>
            <div className="md:col-span-2">
              <button type="submit" className="rounded-lg bg-[#153e30] px-4 py-2.5 text-sm font-bold text-white">
                Associar utilizador existente
              </button>
            </div>
          </form>
        ) : null}
      </section>
      <p className="text-xs text-gray-600">
        Não são apagadas contas ou reservas. O envio de emails e os pagamentos reais continuam desligados.
      </p>
    </div>
  )
}

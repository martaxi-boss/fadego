import { redirect } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/prisma"
import { requireBarbershopBySlug } from "@/lib/authorization"
import ConfigNotice from "@/app/_components/config-notice"
import {
  createStaffMemberAction,
  updateStaffMemberAction,
  linkStaffAccountAction,
} from "../actions"

const firstNotice = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value

export default async function ProfessionalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ notice?: string | string[] }>
}) {
  const { slug } = await params
  const query = await searchParams
  const access = await requireBarbershopBySlug(slug, ["OWNER", "ADMIN", "STAFF"])
  if (access.membership.role === "STAFF") {
    redirect("/admin/" + access.barbershop.slug + "/barbeiro")
  }
  const canManage =
    access.membership.role === "OWNER" || access.membership.role === "ADMIN"

  const [staffMembers, staffAccounts] = await Promise.all([
    db.staffMember.findMany({
      where: { barbershopId: access.barbershop.id },
      orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
    }),
    db.barbershopMember.findMany({
      where: {
        barbershopId: access.barbershop.id, role: "STAFF",
        active: true, revokedAt: null,
        user: { active: true, platformRole: "USER" },
      },
      select: {
        userId: true,
        user: { select: { email: true, name: true } },
      },
      orderBy: { user: { email: "asc" } },
    }),
  ])

  const createAction = createStaffMemberAction.bind(
    null,
    access.barbershop.slug,
  )

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Profissionais</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Cada profissional tem um perfil para marcações. Quando tiver uma
          conta de funcionário ativa no FADEGO, podes associá-la ao perfil
          para que veja apenas a sua própria agenda. Os perfis continuam
          disponíveis mesmo antes de receberem acesso pessoal.
        </p>
        <Link href={"/admin/" + access.barbershop.slug + "/professionals/convites"}
          className="mt-4 inline-block rounded-lg bg-[#205c3e] px-4 py-3 text-sm font-bold text-white">
          Criar e gerir convites individuais
        </Link>
      </section>

      <ConfigNotice notice={firstNotice(query.notice)} />

      {canManage ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Adicionar profissional</h2>
          <form action={createAction} className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Nome</span>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                maxLength={120}
                name="name"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                Fotografia (URL)
              </span>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                name="photoUrl"
                placeholder="https://..."
                type="url"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Estado</span>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                defaultValue="true"
                name="active"
              >
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                className="rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-medium text-white"
                type="submit"
              >
                Adicionar
              </button>
            </div>
          </form>
        </section>
      ) : (
        <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
          A tua role STAFF permite consultar esta configuração, mas não
          alterá-la.
        </p>
      )}

      <section className="space-y-4">
        {staffMembers.map((staffMember) => {
          const archived = staffMember.archivedAt !== null
          const updateAction = updateStaffMemberAction.bind(
            null,
            access.barbershop.slug,
            staffMember.id,
          )

          return (
            <article
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              key={staffMember.id}
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{staffMember.name}</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {archived
                      ? "Arquivado"
                      : staffMember.active
                        ? "Ativo"
                        : "Inativo"}
                  </p>
                </div>
                {staffMember.photoUrl ? (
                  <span className="text-xs text-gray-500">
                    Fotografia configurada
                  </span>
                ) : null}
              </div>

              {canManage && !archived && staffMember.active ? (
                <div className="mb-5 flex flex-wrap items-center gap-3">
                  <Link
                    href={"/admin/" + access.barbershop.slug + "/barbeiro?professional=" + staffMember.id}
                    className="inline-block rounded-lg border border-[#a5cdb2] bg-[#f0f8f1] px-4 py-2 text-sm font-semibold text-[#1d5639]"
                  >
                    Ver painel deste barbeiro →
                  </Link>
                  <span className="text-xs text-gray-500">
                    Pré-visualização da administração; não inicia sessão como funcionário
                  </span>
                </div>
              ) : null}

              {canManage && !archived && staffMember.active ? (
                <form action={linkStaffAccountAction.bind(null, access.barbershop.slug, staffMember.id)}
                  className="mb-6 rounded-xl border border-[#dbe6dc] bg-[#f8fbf8] p-4">
                  <label className="block text-sm font-bold text-[#204632]">
                    Acesso individual do barbeiro
                    <select name="userId" defaultValue={staffMember.userId ?? ""}
                      className="mt-2 block w-full rounded-lg border border-gray-300 bg-white p-3 font-normal">
                      <option value="">Sem conta associada</option>
                      {staffAccounts
                        .filter((account) => !staffMembers.some(
                          (other) => other.id !== staffMember.id && other.userId === account.userId,
                        ))
                        .map((account) => (
                          <option key={account.userId} value={account.userId}>
                            {account.user.name ?? account.user.email} · {account.user.email}
                          </option>
                        ))}
                    </select>
                  </label>
                  <p className="mt-2 text-xs leading-5 text-[#5b715f]">
                    Apenas utilizadores já ativos com a função STAFF nesta barbearia
                    podem ser associados. A ligação não cria nem envia palavras-passe.
                  </p>
                  <button type="submit"
                    className="mt-3 rounded-lg bg-[#173e2d] px-4 py-2.5 text-sm font-bold text-white">
                    Guardar ligação à conta
                  </button>
                </form>
              ) : null}

              {canManage ? (
                <form action={updateAction} className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">Nome</span>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      defaultValue={staffMember.name}
                      maxLength={120}
                      name="name"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">
                      Fotografia (URL)
                    </span>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      defaultValue={staffMember.photoUrl ?? ""}
                      name="photoUrl"
                      type="url"
                    />
                  </label>

                  {archived ? (
                    <>
                      <input name="active" type="hidden" value="false" />
                      <input name="archived" type="hidden" value="true" />
                      <p className="text-sm text-gray-600">
                        O histórico arquivado permanece estável e não pode ser
                        reativado por esta gestão normal.
                      </p>
                    </>
                  ) : (
                    <>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium">
                          Estado
                        </span>
                        <select
                          className="w-full rounded-lg border border-gray-300 px-3 py-2"
                          defaultValue={staffMember.active ? "true" : "false"}
                          name="active"
                        >
                          <option value="true">Ativo</option>
                          <option value="false">Inativo</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium">
                          Arquivo
                        </span>
                        <select
                          className="w-full rounded-lg border border-gray-300 px-3 py-2"
                          defaultValue="false"
                          name="archived"
                        >
                          <option value="false">Manter não arquivado</option>
                          <option value="true">
                            Arquivar (fica inativo)
                          </option>
                        </select>
                      </label>
                    </>
                  )}

                  <div className="md:col-span-2">
                    <button
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium"
                      type="submit"
                    >
                      Guardar profissional
                    </button>
                  </div>
                </form>
              ) : null}
            </article>
          )
        })}

        {staffMembers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600">
            Ainda não existem profissionais configurados.
          </p>
        ) : null}
      </section>
    </div>
  )
}

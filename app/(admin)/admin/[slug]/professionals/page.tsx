import { db } from "@/lib/prisma"
import { requireBarbershopBySlug } from "@/lib/authorization"
import ConfigNotice from "@/app/_components/config-notice"
import {
  createStaffMemberAction,
  updateStaffMemberAction,
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
  const access = await requireBarbershopBySlug(slug, [
    "OWNER",
    "ADMIN",
    "STAFF",
  ])
  const canManage =
    access.membership.role === "OWNER" || access.membership.role === "ADMIN"

  const staffMembers = await db.staffMember.findMany({
    where: { barbershopId: access.barbershop.id },
    orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
  })

  const createAction = createStaffMemberAction.bind(
    null,
    access.barbershop.slug,
  )

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Profissionais</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Profissionais são identidades operacionais da barbearia. Não precisam
          de conta de utilizador e nunca são apagados pela gestão normal.
        </p>
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

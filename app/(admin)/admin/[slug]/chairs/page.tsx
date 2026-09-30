import { db } from "@/lib/prisma"
import { requireBarbershopBySlug } from "@/lib/authorization"
import ConfigNotice from "@/app/_components/config-notice"
import { createChairAction, updateChairAction } from "../actions"

const firstNotice = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value

const modeLabel = {
  WALK_IN: "Walk-in",
  GENERAL_BOOKING: "Reserva geral",
  STAFF_BOOKING: "Profissional identificado",
} as const

export default async function ChairsPage({
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

  const [chairs, staffMembers] = await Promise.all([
    db.chair.findMany({
      where: { barbershopId: access.barbershop.id },
      include: {
        staffMember: {
          select: {
            id: true,
            name: true,
            active: true,
            archivedAt: true,
          },
        },
      },
      orderBy: { number: "asc" },
    }),
    db.staffMember.findMany({
      where: { barbershopId: access.barbershop.id },
      select: {
        id: true,
        name: true,
        active: true,
        archivedAt: true,
      },
      orderBy: { name: "asc" },
    }),
  ])

  const activeStaff = staffMembers.filter(
    (staffMember) => staffMember.active && !staffMember.archivedAt,
  )
  const createAction = createChairAction.bind(null, access.barbershop.slug)

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Cadeiras</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Cada barbearia pode ter no máximo cinco cadeiras canónicas, numeradas
          de 1 a 5. Só cadeiras ativas poderão gerar capacidade numa fase
          posterior.
        </p>
      </section>

      <ConfigNotice notice={firstNotice(query.notice)} />

      {canManage ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Adicionar cadeira</h2>
          <form action={createAction} className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Número</span>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                defaultValue="1"
                name="number"
              >
                {[1, 2, 3, 4, 5].map((number) => (
                  <option key={number} value={number}>
                    {number}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                Nome opcional
              </span>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                maxLength={80}
                name="name"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Modo</span>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                defaultValue="WALK_IN"
                name="mode"
              >
                {Object.entries(modeLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                Profissional
              </span>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                defaultValue=""
                name="staffMemberId"
              >
                <option value="">Sem profissional</option>
                {activeStaff.map((staffMember) => (
                  <option key={staffMember.id} value={staffMember.id}>
                    {staffMember.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-gray-500">
                Obrigatório apenas em Profissional identificado.
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Estado</span>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                defaultValue="true"
                name="active"
              >
                <option value="true">Ativa</option>
                <option value="false">Inativa</option>
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
        {chairs.map((chair) => {
          const updateAction = updateChairAction.bind(
            null,
            access.barbershop.slug,
            chair.id,
          )
          const selectableStaff = staffMembers.filter(
            (staffMember) =>
              (staffMember.active && !staffMember.archivedAt) ||
              staffMember.id === chair.staffMemberId,
          )

          return (
            <article
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              key={chair.id}
            >
              <div className="mb-4">
                <h2 className="font-semibold">
                  Cadeira {chair.number}
                  {chair.name ? ` · ${chair.name}` : ""}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {modeLabel[chair.mode]} · {chair.active ? "Ativa" : "Inativa"}
                  {chair.staffMember && !chair.staffMember.active
                    ? " · profissional inativo"
                    : ""}
                  {chair.staffMember?.archivedAt
                    ? " · profissional arquivado"
                    : ""}
                </p>
              </div>

              {canManage ? (
                <form action={updateAction} className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">
                      Número
                    </span>
                    <select
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      defaultValue={String(chair.number)}
                      name="number"
                    >
                      {[1, 2, 3, 4, 5].map((number) => (
                        <option key={number} value={number}>
                          {number}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">
                      Nome opcional
                    </span>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      defaultValue={chair.name ?? ""}
                      maxLength={80}
                      name="name"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">Modo</span>
                    <select
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      defaultValue={chair.mode}
                      name="mode"
                    >
                      {Object.entries(modeLabel).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">
                      Profissional
                    </span>
                    <select
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      defaultValue={chair.staffMemberId ?? ""}
                      name="staffMemberId"
                    >
                      <option value="">Sem profissional</option>
                      {selectableStaff.map((staffMember) => (
                        <option key={staffMember.id} value={staffMember.id}>
                          {staffMember.name}
                          {!staffMember.active ? " (inativo)" : ""}
                          {staffMember.archivedAt ? " (arquivado)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">
                      Estado
                    </span>
                    <select
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      defaultValue={chair.active ? "true" : "false"}
                      name="active"
                    >
                      <option value="true">Ativa</option>
                      <option value="false">Inativa</option>
                    </select>
                  </label>
                  <div className="flex items-end">
                    <button
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium"
                      type="submit"
                    >
                      Guardar cadeira
                    </button>
                  </div>
                </form>
              ) : null}
            </article>
          )
        })}

        {chairs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600">
            Ainda não existem cadeiras configuradas.
          </p>
        ) : null}
      </section>
    </div>
  )
}

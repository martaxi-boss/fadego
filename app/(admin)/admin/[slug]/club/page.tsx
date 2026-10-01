import ConfigNotice from "@/app/_components/config-notice"
import { requireBarbershopBySlug } from "@/lib/authorization"
import { getMembershipPlans } from "@/lib/club-plans"
import { db } from "@/lib/prisma"
import {
  archiveMembershipPlanAction,
  createMembershipPlanAction,
  updateMembershipPlanAction,
} from "./actions"

const firstNotice = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value

const entitlementLabel = (limit: number | null) =>
  limit === null ? "Ilimitado por ciclo" : `${limit} por ciclo`

export default async function ClubPlansPage({
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

  const [plans, services] = await Promise.all([
    getMembershipPlans(access.barbershop.id),
    db.service.findMany({
      where: { barbershopId: access.barbershop.id },
      orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        active: true,
      },
    }),
  ])

  const createAction = createMembershipPlanAction.bind(
    null,
    access.barbershop.slug,
  )
  const activeServices = services.filter((service) => service.active)

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Club</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Define autonomamente os planos comerciais da barbearia. Cada serviço
          incluído pode ter um limite por ciclo ou utilização ilimitada.
          Pagamentos e adesões de clientes entram numa fase posterior.
        </p>
      </section>

      <ConfigNotice notice={firstNotice(query.notice)} />

      {canManage ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Criar plano Club</h2>
          <form action={createAction} className="mt-4 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
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
                  Preço por ciclo (€)
                </span>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  min="0"
                  name="price"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                Descrição opcional
              </span>
              <textarea
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                maxLength={2000}
                name="description"
                rows={3}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                Benefícios
              </span>
              <textarea
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                maxLength={4000}
                name="benefits"
                placeholder="Texto livre, sem regras automáticas nesta fase."
                rows={4}
              />
            </label>

            <fieldset className="rounded-xl border border-gray-200 p-4">
              <legend className="px-1 text-sm font-semibold">
                Serviços incluídos
              </legend>
              <div className="mt-2 space-y-3">
                {activeServices.map((service) => (
                  <div
                    className="grid gap-3 rounded-lg bg-gray-50 p-3 md:grid-cols-[1fr_auto_auto] md:items-center"
                    key={service.id}
                  >
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        name="serviceId"
                        type="checkbox"
                        value={service.id}
                      />
                      {service.name}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        defaultChecked
                        name={`unlimited:${service.id}`}
                        type="checkbox"
                        value="true"
                      />
                      Ilimitado
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <span>Limite</span>
                      <input
                        className="w-24 rounded-lg border border-gray-300 px-2 py-1.5"
                        min="1"
                        name={`usageLimit:${service.id}`}
                        placeholder="1"
                        step="1"
                        type="number"
                      />
                    </label>
                  </div>
                ))}
                {activeServices.length === 0 ? (
                  <p className="text-sm text-gray-600">
                    Cria ou ativa Serviços antes de os adicionares a um plano.
                  </p>
                ) : null}
              </div>
            </fieldset>

            <label className="block max-w-xs">
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

            <div>
              <button
                className="rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-medium text-white"
                type="submit"
              >
                Criar plano
              </button>
            </div>
          </form>
        </section>
      ) : (
        <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
          A tua role STAFF permite consultar os planos Club, mas não
          criá-los, editá-los ou arquivá-los.
        </p>
      )}

      <section className="space-y-4">
        {plans.map((plan) => {
          const linked = new Map(
            plan.services.map((entitlement) => [
              entitlement.serviceId,
              entitlement,
            ]),
          )
          const editableServices = services.filter(
            (service) => service.active || linked.has(service.id),
          )
          const updateAction = updateMembershipPlanAction.bind(
            null,
            access.barbershop.slug,
            plan.id,
          )
          const archiveAction = archiveMembershipPlanAction.bind(
            null,
            access.barbershop.slug,
            plan.id,
          )

          return (
            <article
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              key={plan.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{plan.name}</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    €{plan.price.toFixed(2)} ·{" "}
                    {plan.archivedAt
                      ? "Arquivado"
                      : plan.active
                        ? "Ativo"
                        : "Inativo"}
                  </p>
                </div>
                {plan.archivedAt ? (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                    Arquivado
                  </span>
                ) : null}
              </div>

              {plan.description ? (
                <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
                  {plan.description}
                </p>
              ) : null}

              <div className="mt-4">
                <h3 className="text-sm font-semibold">Serviços incluídos</h3>
                {plan.services.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-sm text-gray-700">
                    {plan.services.map((entitlement) => (
                      <li key={entitlement.id}>
                        {entitlement.service.name} —{" "}
                        {entitlementLabel(entitlement.usageLimitPerCycle)}
                        {!entitlement.service.active
                          ? " · Serviço atualmente inativo"
                          : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-gray-500">
                    Sem serviços incluídos.
                  </p>
                )}
              </div>

              {plan.benefits ? (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold">Benefícios</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                    {plan.benefits}
                  </p>
                </div>
              ) : null}

              {canManage && !plan.archivedAt ? (
                <div className="mt-5 space-y-4 border-t border-gray-200 pt-5">
                  <form action={updateAction} className="grid gap-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium">
                          Nome
                        </span>
                        <input
                          className="w-full rounded-lg border border-gray-300 px-3 py-2"
                          defaultValue={plan.name}
                          maxLength={120}
                          name="name"
                          required
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium">
                          Preço por ciclo (€)
                        </span>
                        <input
                          className="w-full rounded-lg border border-gray-300 px-3 py-2"
                          defaultValue={plan.price.toFixed(2)}
                          min="0"
                          name="price"
                          required
                          step="0.01"
                          type="number"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">
                        Descrição
                      </span>
                      <textarea
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                        defaultValue={plan.description ?? ""}
                        maxLength={2000}
                        name="description"
                        rows={3}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">
                        Benefícios
                      </span>
                      <textarea
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                        defaultValue={plan.benefits ?? ""}
                        maxLength={4000}
                        name="benefits"
                        rows={4}
                      />
                    </label>

                    <fieldset className="rounded-xl border border-gray-200 p-4">
                      <legend className="px-1 text-sm font-semibold">
                        Serviços incluídos
                      </legend>
                      <div className="mt-2 space-y-3">
                        {editableServices.map((service) => {
                          const entitlement = linked.get(service.id)
                          return (
                            <div
                              className="grid gap-3 rounded-lg bg-gray-50 p-3 md:grid-cols-[1fr_auto_auto] md:items-center"
                              key={service.id}
                            >
                              <label className="flex items-center gap-2 text-sm font-medium">
                                <input
                                  defaultChecked={Boolean(entitlement)}
                                  name="serviceId"
                                  type="checkbox"
                                  value={service.id}
                                />
                                {service.name}
                                {!service.active ? " (inativo)" : ""}
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  defaultChecked={
                                    entitlement?.usageLimitPerCycle === null
                                  }
                                  name={`unlimited:${service.id}`}
                                  type="checkbox"
                                  value="true"
                                />
                                Ilimitado
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <span>Limite</span>
                                <input
                                  className="w-24 rounded-lg border border-gray-300 px-2 py-1.5"
                                  defaultValue={
                                    entitlement?.usageLimitPerCycle ?? ""
                                  }
                                  min="1"
                                  name={`usageLimit:${service.id}`}
                                  step="1"
                                  type="number"
                                />
                              </label>
                            </div>
                          )
                        })}
                      </div>
                    </fieldset>

                    <label className="block max-w-xs">
                      <span className="mb-1 block text-sm font-medium">
                        Estado
                      </span>
                      <select
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                        defaultValue={plan.active ? "true" : "false"}
                        name="active"
                      >
                        <option value="true">Ativo</option>
                        <option value="false">Inativo</option>
                      </select>
                    </label>

                    <div>
                      <button
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium"
                        type="submit"
                      >
                        Guardar plano
                      </button>
                    </div>
                  </form>

                  <form action={archiveAction}>
                    <button
                      className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-900"
                      type="submit"
                    >
                      Arquivar plano
                    </button>
                  </form>
                </div>
              ) : null}
            </article>
          )
        })}

        {plans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600">
            Ainda não existem planos Club configurados.
          </p>
        ) : null}
      </section>
    </div>
  )
}

import type { TenantRole } from "@prisma/client"
import { getMemberships } from "@/lib/club-memberships"
import { db } from "@/lib/prisma"
import {
  enrollExistingCustomerAction,
  enrollNewCustomerAction,
  recordMembershipUsageAction,
  transitionMembershipStatusAction,
} from "./membership-actions"

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativo",
  PAST_DUE: "Pagamento pendente",
  CANCELLED: "Cancelado",
  EXPIRED: "Expirado",
}

const cycleUsageCount = (
  entitlement: {
    usages: Array<{
      cycleStartsAtSnapshot: Date
      cycleEndsAtSnapshot: Date
    }>
  },
  cycleStartsAt: Date,
  cycleEndsAt: Date,
) =>
  entitlement.usages.filter(
    (usage) =>
      usage.cycleStartsAtSnapshot.getTime() === cycleStartsAt.getTime() &&
      usage.cycleEndsAtSnapshot.getTime() === cycleEndsAt.getTime(),
  ).length

const formatter = (timezone: string) =>
  new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  })

export default async function ClubMembershipSection({
  barbershopId,
  slug,
  role,
}: {
  barbershopId: string
  slug: string
  role: TenantRole
}) {
  const canManage = role === "OWNER" || role === "ADMIN"
  const [memberships, plans, customers, shop] = await Promise.all([
    getMemberships(barbershopId),
    db.membershipPlan.findMany({
      where: {
        barbershopId,
        active: true,
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
        price: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    db.customer.findMany({
      where: { barbershopId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    db.barbershop.findUnique({
      where: { id: barbershopId },
      select: { timezone: true },
    }),
  ])
  const timezone = shop?.timezone || "UTC"
  const format = formatter(timezone)

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Membros Club</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          As condições comerciais são congeladas no momento da adesão. Os
          consumos são registados como histórico e os pagamentos continuam
          fora desta fase.
        </p>
      </div>

      {canManage ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold">Aderir cliente existente</h3>
            <form
              action={enrollExistingCustomerAction.bind(null, slug)}
              className="mt-4 space-y-4"
            >
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Cliente</span>
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  name="customerId"
                  required
                >
                  <option value="">Selecionar cliente</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} · {customer.phone}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Plano ativo
                </span>
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  name="membershipPlanId"
                  required
                >
                  <option value="">Selecionar plano</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · €{plan.price.toFixed(2)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                disabled={customers.length === 0 || plans.length === 0}
                type="submit"
              >
                Registar adesão
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold">Novo cliente + adesão</h3>
            <form
              action={enrollNewCustomerAction.bind(null, slug)}
              className="mt-4 grid gap-4"
            >
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
                  Telemóvel
                </span>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  maxLength={32}
                  name="phone"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Email opcional
                </span>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  maxLength={254}
                  name="email"
                  type="email"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Plano ativo
                </span>
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  name="membershipPlanId"
                  required
                >
                  <option value="">Selecionar plano</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · €{plan.price.toFixed(2)}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <button
                  className="rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  disabled={plans.length === 0}
                  type="submit"
                >
                  Criar cliente e aderir
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : (
        <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
          A tua role STAFF permite consultar membros e utilização Club, mas não
          criar adesões, alterar estados ou registar consumos.
        </p>
      )}

      <div className="space-y-4">
        {memberships.map((membership) => (
          <article
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            key={membership.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{membership.customer.name}</h3>
                <p className="mt-1 text-sm text-gray-600">
                  {membership.customer.phone}
                  {membership.customer.email
                    ? ` · ${membership.customer.email}`
                    : ""}
                </p>
                <p className="mt-2 text-sm font-medium">
                  {membership.planNameSnapshot} · €
                  {membership.planPriceSnapshot.toFixed(2)}
                </p>
                {membership.planBenefitsSnapshot ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
                    {membership.planBenefitsSnapshot}
                  </p>
                ) : null}
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                {statusLabel[membership.status] ?? membership.status}
              </span>
            </div>

            <p className="mt-4 text-xs text-gray-500">
              Ciclo atual: {format.format(membership.currentCycleStartsAt)} →{" "}
              {format.format(membership.currentCycleEndsAt)} ({timezone})
            </p>

            <div className="mt-4">
              <h4 className="text-sm font-semibold">Serviços incluídos</h4>
              {membership.entitlements.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {membership.entitlements.map((entitlement) => {
                    const used = cycleUsageCount(
                      entitlement,
                      membership.currentCycleStartsAt,
                      membership.currentCycleEndsAt,
                    )
                    const remaining =
                      entitlement.usageLimitPerCycle === null
                        ? null
                        : Math.max(
                            0,
                            entitlement.usageLimitPerCycle - used,
                          )
                    const recordAction = recordMembershipUsageAction.bind(
                      null,
                      slug,
                      membership.id,
                      entitlement.id,
                    )

                    return (
                      <div
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 p-3"
                        key={entitlement.id}
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {entitlement.serviceNameSnapshot}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {entitlement.usageLimitPerCycle === null
                              ? `Ilimitado · ${used} utilizações registadas neste ciclo`
                              : `${used} usadas · ${remaining} restantes de ${entitlement.usageLimitPerCycle}`}
                            {!entitlement.service.active
                              ? " · Serviço atual inativo"
                              : ""}
                          </p>
                        </div>
                        {canManage && membership.status === "ACTIVE" ? (
                          <form action={recordAction}>
                            <button
                              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium disabled:opacity-50"
                              disabled={remaining === 0}
                              type="submit"
                            >
                              Registar uso
                            </button>
                          </form>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">
                  Esta adesão não tem serviços incluídos.
                </p>
              )}
            </div>

            {canManage &&
            (membership.status === "ACTIVE" ||
              membership.status === "PAST_DUE") ? (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-200 pt-4">
                {membership.status === "ACTIVE" ? (
                  <form
                    action={transitionMembershipStatusAction.bind(
                      null,
                      slug,
                      membership.id,
                      "PAST_DUE",
                    )}
                  >
                    <button
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium"
                      type="submit"
                    >
                      Marcar PAST_DUE
                    </button>
                  </form>
                ) : (
                  <form
                    action={transitionMembershipStatusAction.bind(
                      null,
                      slug,
                      membership.id,
                      "ACTIVE",
                    )}
                  >
                    <button
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium"
                      type="submit"
                    >
                      Reativar
                    </button>
                  </form>
                )}

                <form
                  action={transitionMembershipStatusAction.bind(
                    null,
                    slug,
                    membership.id,
                    "CANCELLED",
                  )}
                >
                  <button
                    className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-medium text-amber-900"
                    type="submit"
                  >
                    Cancelar Membership
                  </button>
                </form>

                <form
                  action={transitionMembershipStatusAction.bind(
                    null,
                    slug,
                    membership.id,
                    "EXPIRED",
                  )}
                >
                  <button
                    className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium"
                    type="submit"
                  >
                    Marcar expirado
                  </button>
                </form>
              </div>
            ) : null}

            {membership.cancelledAt ? (
              <p className="mt-3 text-xs text-gray-500">
                Cancelado em {format.format(membership.cancelledAt)}.
              </p>
            ) : null}
            {membership.expiredAt ? (
              <p className="mt-3 text-xs text-gray-500">
                Expirado em {format.format(membership.expiredAt)}.
              </p>
            ) : null}
          </article>
        ))}

        {memberships.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600">
            Ainda não existem adesões Club.
          </p>
        ) : null}
      </div>
    </section>
  )
}

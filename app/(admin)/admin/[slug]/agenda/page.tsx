import Link from "next/link"
import { requireBarbershopBySlug } from "@/lib/authorization"
import { db } from "@/lib/prisma"
import {
  adjacentAgendaDate,
  agendaUtcSearchWindow,
  isValidAgendaDate,
  localAgendaDate,
  resolveAgendaTimezone,
} from "@/lib/admin-agenda"
import { cancelTenantBookingAction } from "./actions"

export const dynamic = "force-dynamic"

const statusLabels = {
  CONFIRMED: "Confirmada",
  COMPLETED: "Concluída",
  CANCELLED_BY_CUSTOMER: "Cancelada pelo cliente",
  CANCELLED_BY_SHOP: "Cancelada pela barbearia",
  NO_SHOW: "Falta",
  NEEDS_REASSIGNMENT: "Precisa de reatribuição",
} as const

const statusStyles = {
  CONFIRMED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  COMPLETED: "bg-sky-50 text-sky-800 border-sky-200",
  CANCELLED_BY_CUSTOMER: "bg-gray-100 text-gray-600 border-gray-200",
  CANCELLED_BY_SHOP: "bg-gray-100 text-gray-600 border-gray-200",
  NO_SHOW: "bg-amber-50 text-amber-800 border-amber-200",
  NEEDS_REASSIGNMENT: "bg-rose-50 text-rose-800 border-rose-200",
} as const

const asText = (value?: string | string[]) =>
  typeof value === "string" ? value : ""

export default async function AgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ date?: string | string[]; status?: string | string[]; notice?: string | string[] }>
}) {
  const { slug } = await params
  const query = await searchParams
  const access = await requireBarbershopBySlug(slug, ["OWNER", "ADMIN", "STAFF"])
  const shop = await db.barbershop.findUnique({
    where: { id: access.barbershop.id },
    select: { timezone: true },
  })
  const timeZone = resolveAgendaTimezone(shop?.timezone ?? null)
  const requested = asText(query.date)
  const date = isValidAgendaDate(requested)
    ? requested
    : localAgendaDate(new Date(), timeZone)
  const requestedStatus = asText(query.status)
  const selectedStatus = requestedStatus in statusLabels ? requestedStatus : "ALL"
  const window = agendaUtcSearchWindow(date)
  const records = await db.booking.findMany({
    where: { barbershopId: access.barbershop.id, startsAt: window },
    select: {
      id: true,
      startsAt: true,
      status: true,
      serviceNameSnapshot: true,
      serviceDurationMinutes: true,
      servicePriceSnapshot: true,
      customerNameSnapshot: true,
      customerPhoneSnapshot: true,
      staffNameSnapshot: true,
      chairNumberSnapshot: true,
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: 2500,
  })
  const allDay = records.filter((item) => localAgendaDate(item.startsAt, timeZone) === date)
  const visible = selectedStatus === "ALL"
    ? allDay
    : allDay.filter((item) => item.status === selectedStatus)
  const canManage = access.membership.role !== "STAFF"
  const hour = new Intl.DateTimeFormat("pt-PT", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const money = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" })
  const basePath = "/admin/" + access.barbershop.slug + "/agenda"
  const notice = asText(query.notice)

  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-lg sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Operação diária</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Agenda de marcações</h1>
            <p className="mt-2 text-sm text-slate-300">Consulta de reservas por dia, profissional e estado · {timeZone}</p>
          </div>
          <Link className="rounded-xl border border-white/20 px-4 py-2 text-sm font-medium hover:bg-white/10"
            href={"/b/" + access.barbershop.slug}>Abrir página de reservas ↗</Link>
        </div>
      </header>

      {!shop?.timezone ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Configura o fuso horário da barbearia. A agenda usa UTC temporariamente.
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Marcações do dia", value: allDay.length },
          { label: "Confirmadas", value: allDay.filter((item) => item.status === "CONFIRMED").length },
          { label: "Por reatribuir", value: allDay.filter((item) => item.status === "NEEDS_REASSIGNMENT").length },
        ].map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{metric.label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{metric.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <form action={basePath} className="flex flex-wrap items-end gap-3">
          <label className="block text-sm font-medium text-slate-700">
            Data
            <input className="mt-1 block rounded-lg border border-gray-300 px-3 py-2" type="date" name="date"
              defaultValue={date} min="2020-01-01" max="2100-12-31" required />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Estado
            <select className="mt-1 block rounded-lg border border-gray-300 px-3 py-2" name="status" defaultValue={selectedStatus}>
              <option value="ALL">Todos os estados</option>
              {Object.entries(statusLabels).map(([key, value]) => (
                <option key={key} value={key}>{value}</option>
              ))}
            </select>
          </label>
          <button className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            type="submit">Filtrar</button>
          <div className="flex items-center gap-2 sm:ml-auto">
            <Link className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
              href={basePath + "?date=" + adjacentAgendaDate(date, -1)}>← Anterior</Link>
            <Link className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
              href={basePath + "?date=" + adjacentAgendaDate(date, 1)}>Seguinte →</Link>
          </div>
        </form>
      </section>

      {notice === "cancelled" ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Marcação cancelada.</p> : null}
      {notice === "rate-limit" ? <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Demasiadas ações. Tenta mais tarde.</p> : null}
      {notice === "unavailable" || notice === "invalid" ? <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Não foi possível alterar a marcação.</p> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{date} · {visible.length} marcações</h2>
        {visible.map((booking) => (
          <article key={booking.id} className="flex flex-wrap items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="min-w-20 rounded-xl bg-slate-100 px-3 py-2 text-center text-xl font-semibold text-slate-900">
              {hour.format(booking.startsAt)}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-900">{booking.customerNameSnapshot}</h3>
                <span className={"rounded-full border px-2.5 py-0.5 text-xs font-semibold " + statusStyles[booking.status]}>
                  {statusLabels[booking.status]}
                </span>
              </div>
              <p className="text-sm text-gray-700">
                {booking.serviceNameSnapshot} · {booking.serviceDurationMinutes} min · {money.format(Number(booking.servicePriceSnapshot))}
              </p>
              <p className="text-sm text-gray-500">
                {booking.staffNameSnapshot ?? "Atendimento geral"} · Cadeira {booking.chairNumberSnapshot}
              </p>
              <p className="text-sm text-gray-500">Contacto: {booking.customerPhoneSnapshot}</p>
            </div>
            {canManage && (booking.status === "CONFIRMED" || booking.status === "NEEDS_REASSIGNMENT") ? (
              <form action={cancelTenantBookingAction.bind(null, access.barbershop.slug, booking.id, date)}>
                <button className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                  type="submit" aria-label={"Cancelar marcação de " + booking.customerNameSnapshot}>
                  Cancelar marcação
                </button>
              </form>
            ) : null}
          </article>
        ))}
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-9 text-center">
            <p className="font-semibold text-slate-900">Sem marcações nesta seleção</p>
            <p className="mt-2 text-sm text-gray-500">Escolhe outra data ou altera o filtro.</p>
          </div>
        ) : null}
        {records.length >= 2500 ? (
          <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            O limite de consulta foi atingido. A listagem pode estar incompleta; reduz o intervalo ou consulta o suporte.
          </p>
        ) : null}
      </section>
    </div>
  )
}

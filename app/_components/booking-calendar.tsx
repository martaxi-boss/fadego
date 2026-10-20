import Link from "next/link"
import { agendaDisplayInterval, agendaEventLanes, localAgendaDate } from "@/lib/admin-agenda"

type CalendarBooking = {
  id: string
  startsAt: Date
  endsAt: Date
  status: string
  customerNameSnapshot: string
  serviceNameSnapshot: string
  staffNameSnapshot?: string | null
  staffMemberId?: string | null
}

const statusLabel: Record<string, string> = {
  CONFIRMED: "Confirmada", COMPLETED: "Concluída", NO_SHOW: "Falta",
  NEEDS_REASSIGNMENT: "Por reatribuir", CANCELLED_BY_CUSTOMER: "Cancelada pelo cliente",
  CANCELLED_BY_SHOP: "Cancelada pela barbearia",
}
const colors = ["border-emerald-500 bg-emerald-50 text-emerald-950", "border-sky-500 bg-sky-50 text-sky-950",
  "border-violet-500 bg-violet-50 text-violet-950", "border-amber-500 bg-amber-50 text-amber-950",
  "border-rose-500 bg-rose-50 text-rose-950"]

export function BookingCalendar({ dates, bookings, timeZone, dayHref, professionalName }: {
  dates: string[]
  bookings: CalendarBooking[]
  timeZone: string
  dayHref: (date: string) => string
  professionalName?: string
}) {
  const professionalIds = [...new Set(bookings.map((item) => item.staffMemberId ?? "GENERAL"))].sort()
  const columns = dates.length > 1
    ? dates.map((date) => ({ date, id: date, name: "" }))
    : professionalIds.length > 0
      ? professionalIds.map((id) => ({ date: dates[0], id,
          name: professionalName ?? bookings.find((item) => (item.staffMemberId ?? "GENERAL") === id)?.staffNameSnapshot ?? "Atendimento geral" }))
      : [{ date: dates[0], id: "empty", name: professionalName ?? "Marcações" }]
  const minutes = bookings.flatMap((item) => {
    const { from, to } = agendaDisplayInterval(item, timeZone)
    return [from, to]
  })
  const start = Math.floor(Math.min(8 * 60, ...minutes) / 60) * 60
  const end = Math.min(1440, Math.ceil(Math.max(20 * 60, ...minutes) / 60) * 60)
  const height = (end - start) * 2
  const time = (date: Date) => new Intl.DateTimeFormat("pt-PT", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(date)
  const label = (date: string) => new Intl.DateTimeFormat("pt-PT", {
    timeZone: "UTC", weekday: "short", day: "numeric", month: "short",
  }).format(new Date(date + "T12:00:00Z"))

  return (
    <section aria-label={dates.length > 1 ? "Calendário semanal" : "Calendário diário"}
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 p-4">
        <h2 className="font-bold text-[#183b2c]">{dates.length > 1 ? "A semana num olhar" : "O dia por profissional"}</h2>
        <p className="mt-1 text-sm text-gray-600">Seleciona uma marcação para consultar os detalhes e ações abaixo. Desliza para ver todas as colunas.</p>
      </div>
      <div tabIndex={0} role="region" aria-label="Horários e marcações; deslocação horizontal e vertical"
        className="max-h-[650px] overflow-auto focus-visible:outline-2 focus-visible:outline-emerald-700">
        <div style={{ minWidth: 64 + columns.length * 190 }}>
          <div className="sticky top-0 z-20 grid border-b border-gray-200 bg-[#f4f8f4]"
            style={{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(190px, 1fr))` }}>
            <span className="p-3 text-xs text-gray-500">Hora</span>
            {columns.map((column) => <div key={column.id} className="border-l border-gray-200 p-3">
              <Link href={dayHref(column.date)} className="text-sm font-bold text-[#205a3f] hover:underline">
                {dates.length > 1 ? label(column.date) : column.name}
              </Link>
              <p className="text-xs text-gray-500">{dates.length > 1 ? "Abrir dia" : label(column.date)}</p>
            </div>)}
          </div>
          <div className="grid" style={{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(190px, 1fr))` }}>
            <div className="relative bg-gray-50" style={{ height }}>
              {Array.from({ length: (end - start) / 60 }, (_, i) => <span key={i}
                className="absolute right-2 text-xs tabular-nums text-gray-500" style={{ top: i * 120 + 4 }}>
                {String(start / 60 + i).padStart(2, "0")}:00
              </span>)}
            </div>
            {columns.map((column) => {
              const events = bookings.filter((booking) => localAgendaDate(booking.startsAt, timeZone) === column.date &&
                (dates.length > 1 || (booking.staffMemberId ?? "GENERAL") === column.id))
              return <div key={column.id} className="relative border-l border-gray-200"
                style={{ height, backgroundImage: "repeating-linear-gradient(to bottom, transparent 0px, transparent 59px, #e5e7eb 59px, #e5e7eb 60px)" }}>
                {agendaEventLanes(events.map((source) => {
                  const { from, to } = agendaDisplayInterval(source, timeZone)
                  return { id: source.id, source, startsAt: new Date(from * 60000), endsAt: new Date(to * 60000) }
                })).map(({ booking: event, lane, lanes }) => {
                  const booking = event.source
                  const { from, to } = agendaDisplayInterval(booking, timeZone)
                  const color = colors[professionalIds.indexOf(booking.staffMemberId ?? "GENERAL") % colors.length]
                  const cancelled = booking.status.startsWith("CANCELLED")
                  return <a key={booking.id} href={"#booking-" + booking.id}
                    aria-label={`${time(booking.startsAt)}–${time(booking.endsAt)}, ${booking.customerNameSnapshot}, ${booking.serviceNameSnapshot}, ${professionalName ?? booking.staffNameSnapshot ?? "Atendimento geral"}, ${statusLabel[booking.status] ?? booking.status}`}
                    className={"absolute overflow-hidden rounded-lg border-l-4 p-1.5 text-xs shadow-sm hover:z-10 hover:ring-2 hover:ring-emerald-700 focus:z-10 focus:outline-2 focus:outline-emerald-700 " +
                      (cancelled ? "border-gray-400 bg-gray-100 text-gray-600" : color)}
                    style={{ top: (from - start) * 2, height: Math.max(24, (to - from) * 2 - 3),
                      left: `calc(${lane * 100 / lanes}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}>
                    <span className="block truncate font-bold tabular-nums">{time(booking.startsAt)}–{time(booking.endsAt)}</span>
                    <span className="block truncate font-semibold">{booking.customerNameSnapshot}</span>
                    <span className="block truncate">{booking.serviceNameSnapshot}</span>
                    <span className="block truncate">{professionalName ?? booking.staffNameSnapshot ?? "Atendimento geral"}</span>
                    <span className="block truncate">{statusLabel[booking.status] ?? booking.status}</span>
                  </a>
                })}
              </div>
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

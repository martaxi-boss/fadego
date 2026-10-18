import Link from "next/link"
import { notFound } from "next/navigation"
import { db } from "@/lib/prisma"
import { requireStaffScope } from "@/lib/staff-planning"
import { isValidAgendaDate, localAgendaDate, resolveAgendaTimezone } from "@/lib/admin-agenda"
import { getBookingRescheduleAvailability, AvailabilityError } from "@/lib/availability"
import { rescheduleBarberBookingAction } from "../../actions"

export const dynamic = "force-dynamic"

export default async function RescheduleBarberBookingPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string; bookingId: string }>
  searchParams: Promise<{ professional?: string; date?: string }>
}) {
  const { slug, bookingId } = await params
  const query = await searchParams
  const scope = await requireStaffScope(slug, query.professional)
  const booking = await db.booking.findFirst({
    where: {
      id: bookingId, barbershopId: scope.shop.id,
      staffMemberId: scope.staffMember.id, status: "CONFIRMED",
      startsAt: { gt: new Date() },
    },
    select: {
      id: true, customerNameSnapshot: true, serviceNameSnapshot: true,
      serviceDurationMinutes: true, startsAt: true, endsAt: true,
    },
  })
  if (!booking) notFound()
  const config = await db.barbershop.findUnique({
    where: { id: scope.shop.id }, select: { timezone: true },
  })
  const timezone = resolveAgendaTimezone(config?.timezone ?? null)
  const today = localAgendaDate(new Date(), timezone)
  const date = isValidAgendaDate(query.date) ? query.date : today
  let available: Array<{ startsAt: Date; localTime: string }> = []
  if (scope.shop.status === "ACTIVE") {
    try {
      const slots = await getBookingRescheduleAvailability({
        barbershopId: scope.shop.id,
        requestedStaffMemberId: scope.staffMember.id,
        mode: "STAFF_BOOKING",
        durationMinutes: booking.serviceDurationMinutes,
        excludeBookingId: booking.id,
        localDate: date,
      })
      available = slots.slots
    } catch (error) {
      if (!(error instanceof AvailabilityError)) throw error
    }
  }
  const personal = "/admin/" + slug + "/barbeiro?" +
    new URLSearchParams({ professional: scope.staffMember.id, date }).toString()
  const currentDay = localAgendaDate(booking.startsAt, timezone)
  return (
    <div className="space-y-6">
      <header className="rounded-[2rem] bg-[#143e30] p-7 text-white">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b8e6c7]">
          Agenda individual · {scope.staffMember.name}
        </p>
        <h1 className="mt-3 text-3xl font-black">Reagendar marcação</h1>
        <p className="mt-3 text-sm leading-6 text-[#dfebe1]">
          {booking.customerNameSnapshot} · {booking.serviceNameSnapshot} ·
          {" "}{booking.serviceDurationMinutes} minutos
        </p>
        <p className="mt-2 text-sm text-[#dfebe1]">
          Horário atual: {currentDay} · {new Intl.DateTimeFormat("pt-PT", {
            timeZone: timezone, hour: "2-digit", minute: "2-digit",
          }).format(booking.startsAt)}
        </p>
      </header>
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-bold text-[#19402f]">Escolher horário livre</h2>
        <p className="mt-2 text-sm text-gray-600">
          Mantém o profissional e o serviço. Respeita a abertura da barbearia,
          as folgas individuais, a cadeira e as reservas existentes.
        </p>
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="professional" value={scope.staffMember.id} />
          <label className="text-sm font-semibold">Novo dia
            <input type="date" name="date" required defaultValue={date}
              className="mt-1 block rounded-lg border border-gray-300 p-3" />
          </label>
          <button type="submit"
            className="rounded-lg bg-[#245f43] px-4 py-3 text-sm font-bold text-white">
            Ver disponibilidade
          </button>
        </form>
        {scope.shop.status !== "ACTIVE" ? (
          <p role="status" className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            A barbearia está suspensa. É possível consultar a agenda de teste,
            mas não reagendar marcações até à ativação.
          </p>
        ) : null}
        <form
          action={rescheduleBarberBookingAction.bind(null, slug, scope.staffMember.id, booking.id, date)}
          className="mt-6 space-y-4">
          <label className="block text-sm font-semibold">Horário
            <select name="startsAt" required defaultValue=""
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3">
              <option value="" disabled>Selecionar horário</option>
              {available.map((slot) => (
                <option key={slot.startsAt.toISOString()} value={slot.startsAt.toISOString()}>
                  {slot.localTime}
                </option>
              ))}
            </select>
          </label>
          <button disabled={available.length === 0} type="submit"
            className="rounded-lg bg-[#1b583c] px-5 py-3 font-bold text-white disabled:opacity-40">
            Guardar novo horário
          </button>
        </form>
        <Link href={personal}
          className="mt-5 inline-block text-sm font-semibold text-[#245f43] underline">
          ← Voltar à agenda
        </Link>
      </section>
    </div>
  )
}

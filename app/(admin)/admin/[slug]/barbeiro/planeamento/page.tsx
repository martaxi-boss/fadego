import Link from "next/link"
import { db } from "@/lib/prisma"
import { getAvailability, AvailabilityError } from "@/lib/availability"
import { bookingEmailReadyForTenant } from "@/lib/booking-email"
import { localAgendaDate, resolveAgendaTimezone, isValidAgendaDate } from "@/lib/admin-agenda"
import { requireStaffScope } from "@/lib/staff-planning"
import { minuteString } from "@/lib/staff-schedule"
import {
  createBarberBookingAction, setBarberWeeklyHourAction,
  addBarberBlockAction, removeBarberBlockAction,
} from "../actions"

export const dynamic = "force-dynamic"

const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

export default async function BarberPlanningPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ professional?: string; date?: string; service?: string }>
}) {
  const { slug } = await params
  const query = await searchParams
  const scope = await requireStaffScope(slug, query.professional)
  const id = scope.staffMember.id
  const own = scope.role === "STAFF"
  const shop = await db.barbershop.findUnique({
    where: { id: scope.shop.id }, select: { timezone: true },
  })
  const timezone = resolveAgendaTimezone(shop?.timezone ?? null)
  const day = isValidAgendaDate(query.date) ? query.date : localAgendaDate(new Date(), timezone)
  const link = (path: string) => path + "?professional=" + encodeURIComponent(id)
  const [services, weekly, blocks, emailReady] = await Promise.all([
    db.service.findMany({
      where: { barbershopId: scope.shop.id, active: true },
      select: { id: true, name: true, durationMinutes: true, price: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    db.staffWeeklyHour.findMany({
      where: { barbershopId: scope.shop.id, staffMemberId: id },
      orderBy: { weekday: "asc" },
    }),
    db.staffScheduleBlock.findMany({
      where: { barbershopId: scope.shop.id, staffMemberId: id,
        localDate: { gte: day } },
      orderBy: [{ localDate: "asc" }, { startsMinute: "asc" }],
      take: 90,
    }),
    bookingEmailReadyForTenant(slug),
  ])
  const service = services.find((item) => item.id === query.service) ?? services[0]
  let slots: Array<{ startsAt: Date; localTime: string }> = []
  if (scope.shop.status === "ACTIVE" && service && emailReady) {
    try {
      const result = await getAvailability({
        barbershopId: scope.shop.id, serviceId: service.id,
        requestedStaffMemberId: id, localDate: day,
      })
      slots = result.slots
    } catch (error) {
      if (!(error instanceof AvailabilityError)) throw error
    }
  }

  const parent = link("/admin/" + slug + "/barbeiro")

  return (
    <div className="space-y-6">
      <header className="rounded-[2rem] bg-[#163d30] p-6 text-white sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b5e6c7]">
          {own ? "Planeamento pessoal" : "Planeamento da equipa · vista de administração"}
        </p>
        <h1 className="mt-3 text-3xl font-black">Planeamento de {scope.staffMember.name}</h1>
        <p className="mt-3 text-sm text-[#d8e9dc]">
          Marcações, horário individual, pausas e folgas. Sempre sincronizado
          com a agenda central e sem duplicar reservas.
        </p>
        <Link href={parent} className="mt-5 inline-block rounded-lg border border-white/50 px-4 py-2 text-sm font-bold">
          ← Voltar à agenda individual
        </Link>
      </header>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-xl font-black text-[#173b2b]">Adicionar marcação de cliente</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Para clientes que telefonam ou chegam ao balcão. Exige email válido e
          Gmail do negócio pronto para enviar o acesso privado à reserva.
        </p>
        {!emailReady || scope.shop.status !== "ACTIVE" ? (
          <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            As marcações novas estão bloqueadas enquanto esta barbearia não estiver
            ativa e o envio de confirmações pelo seu Gmail não estiver autorizado.
            Podes continuar a preparar os horários e folgas.
          </p>
        ) : null}
        <form method="get" className="mt-5 grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="professional" value={id} />
          <label className="text-sm font-semibold">Serviço
            <select name="service" defaultValue={service?.id ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3">
              {services.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.durationMinutes} min
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">Dia
            <input type="date" required name="date" defaultValue={day}
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <button type="submit" className="self-end rounded-lg bg-[#173e30] px-4 py-3 text-sm font-bold text-white">
            Consultar horários
          </button>
        </form>
        <form action={createBarberBookingAction.bind(null, slug, id, day)}
          className="mt-6 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="serviceId" value={service?.id ?? ""} />
          <label className="text-sm font-semibold sm:col-span-2">Horário livre
            <select required name="startsAt" defaultValue=""
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3">
              <option value="" disabled>Selecionar horário</option>
              {slots.map((slot) => (
                <option key={slot.startsAt.toISOString()} value={slot.startsAt.toISOString()}>
                  {slot.localTime}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">Nome do cliente
            <input required maxLength={120} name="customerName"
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <label className="text-sm font-semibold">Telefone
            <input required maxLength={32} name="customerPhone" inputMode="tel"
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">Email obrigatório do cliente
            <input required type="email" maxLength={254} name="customerEmail"
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <button type="submit" disabled={!emailReady || scope.shop.status !== "ACTIVE" || slots.length === 0}
            className="rounded-lg bg-[#18553b] px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-2">
            Confirmar marcação e enviar email
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-xl font-black text-[#173b2b]">Horário semanal do profissional</h2>
        <p className="mt-2 text-sm text-gray-600">
          Sem horário individual definido, o barbeiro segue o horário da barbearia.
          Nunca pode aceitar clientes fora da abertura do estabelecimento.
        </p>
        <div className="mt-5 space-y-3">
          {DAYS.map((label, weekday) => {
            const hour = weekly.find((item) => item.weekday === weekday)
            return (
              <form key={weekday}
                action={setBarberWeeklyHourAction.bind(null, slug, id, day)}
                className="grid gap-2 rounded-xl border border-gray-200 p-4 sm:grid-cols-[minmax(100px,1fr)_minmax(100px,1fr)_90px_90px_auto] sm:items-end">
                <input type="hidden" name="weekday" value={weekday} />
                <span className="font-bold text-[#234a35]">{label}</span>
                <label className="text-xs font-semibold">Modo
                  <select name="isClosed" defaultValue={hour?.isClosed ? "true" : "false"}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-2">
                    <option value="false">Trabalha</option>
                    <option value="true">Folga</option>
                  </select>
                </label>
                <label className="text-xs font-semibold">Início
                  <input name="opensAt" type="time" step={900}
                    defaultValue={minuteString(hour?.opensAt ?? 540)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-2" />
                </label>
                <label className="text-xs font-semibold">Fim
                  <input name="closesAt" type="time" step={900}
                    defaultValue={minuteString(hour?.closesAt ?? 1080)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-2" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button name="defaultHours" value="false" className="rounded-lg bg-[#205b3c] px-3 py-2 text-xs font-bold text-white">
                    Guardar
                  </button>
                  <button name="defaultHours" value="true" className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold">
                    Padrão
                  </button>
                </div>
              </form>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-xl font-black text-[#173b2b]">Pausas, férias e indisponibilidade</h2>
        <p className="mt-2 text-sm text-gray-600">
          Bloqueia um período ou o dia inteiro. Se já houver marcações nesse
          período, o sistema recusa o bloqueio até essas reservas serem resolvidas.
        </p>
        <form action={addBarberBlockAction.bind(null, slug, id, day)}
          className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Dia
            <input type="date" name="localDate" required defaultValue={day}
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <label className="text-sm font-semibold">Tipo
            <select name="fullDay" defaultValue="true"
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3">
              <option value="true">Dia inteiro</option>
              <option value="false">Pausa / horas específicas</option>
            </select>
          </label>
          <label className="text-sm font-semibold">Início da pausa
            <input type="time" step={900} name="opensAt" defaultValue="12:00"
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <label className="text-sm font-semibold">Fim da pausa
            <input type="time" step={900} name="closesAt" defaultValue="13:00"
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">Motivo (facultativo)
            <input name="label" maxLength={80} placeholder="Pausa, formação, férias..."
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <button type="submit" className="rounded-lg bg-[#205b3c] px-4 py-3 font-bold text-white sm:col-span-2">
            Bloquear disponibilidade
          </button>
        </form>
        <h3 className="mt-7 font-bold">Períodos bloqueados</h3>
        <div className="mt-3 divide-y divide-gray-100">
          {blocks.map((block) => (
            <div key={block.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <p className="text-sm text-[#274a35]">
                <strong>{block.localDate}</strong> · {minuteString(block.startsMinute)}–{minuteString(block.endsMinute)}
                {block.label ? " · " + block.label : ""}
              </p>
              <form action={removeBarberBlockAction.bind(null, slug, id, day, block.id)}>
                <button type="submit" className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold">
                  Remover
                </button>
              </form>
            </div>
          ))}
          {blocks.length === 0 ? <p className="py-4 text-sm text-gray-500">Sem pausas ou folgas registadas.</p> : null}
        </div>
      </section>
      <p className="text-xs text-gray-500">
        A alteração do horário individual é validada contra reservas futuras.
        O Gmail, os preços e as outras agendas continuam reservados à gestão da barbearia.
      </p>
    </div>
  )
}

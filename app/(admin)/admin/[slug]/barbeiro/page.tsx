import Link from "next/link"
import { CalendarDays, Clock3, Scissors, UserRound, ArrowLeft, ArrowRight } from "lucide-react"
import { requireBarbershopBySlug } from "@/lib/authorization"
import { db } from "@/lib/prisma"
import {
  adjacentAgendaDate, agendaUtcSearchWindow, isValidAgendaDate,
  localAgendaDate, resolveAgendaTimezone,
} from "@/lib/admin-agenda"
import { resolveStaffPanelTarget } from "@/lib/staff-panel-policy"

export const dynamic = "force-dynamic"

const statusLabels: Record<string, string> = {
  CONFIRMED: "Confirmada",
  COMPLETED: "Concluída",
  CANCELLED_BY_CUSTOMER: "Cancelada pelo cliente",
  CANCELLED_BY_SHOP: "Cancelada pela barbearia",
  NO_SHOW: "Falta",
  NEEDS_REASSIGNMENT: "A aguardar reatribuição",
}

const dateText = (value: unknown) => typeof value === "string" ? value : ""
const rowTime = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("pt-PT", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(date)

export default async function BarberPersonalPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ date?: string | string[]; professional?: string | string[] }>
}) {
  const { slug } = await params
  const query = await searchParams
  const access = await requireBarbershopBySlug(slug, ["OWNER", "ADMIN", "STAFF"])
  const shopId = access.barbershop.id
  const manager = access.membership.role !== "STAFF"
  const selection = resolveStaffPanelTarget(
    access.membership.role, access.user.id, query.professional,
  )
  const shop = await db.barbershop.findUnique({
    where: { id: shopId },
    select: { timezone: true },
  })
  const timeZone = resolveAgendaTimezone(shop?.timezone ?? null)
  const today = localAgendaDate(new Date(), timeZone)
  const requestedDate = dateText(query.date)
  const date = isValidAgendaDate(requestedDate) ? requestedDate : today

  // Staff identities are always resolved from the authenticated user, NOT from
  // the URL. Manager previews remain scoped to active profiles of this shop.
  const [professionals, professional] = await Promise.all([
    manager
      ? db.staffMember.findMany({
          where: { barbershopId: shopId, active: true, archivedAt: null },
          select: { id: true, name: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        })
      : Promise.resolve([]),
    selection.mode === "own"
      ? db.staffMember.findFirst({
          where: {
            barbershopId: shopId, userId: selection.userId,
            active: true, archivedAt: null,
          },
          select: { id: true, name: true },
        })
      : selection.mode === "preview"
        ? db.staffMember.findFirst({
            where: {
              id: selection.professionalId, barbershopId: shopId,
              active: true, archivedAt: null,
            },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
  ])

  const link = (day: string) => {
    const query = new URLSearchParams({ date: day })
    if (manager && professional) query.set("professional", professional.id)
    return "/admin/" + slug + "/barbeiro?" + query.toString()
  }

  if (!professional) {
    return (
      <div className="space-y-5">
        <header className="rounded-[2rem] bg-[#153e30] p-7 text-white sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.17em] text-emerald-200">
            {manager ? "Pré-visualização de gestão" : "Acesso individual de funcionário"}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">
            Painel do barbeiro
          </h1>
          <p className="mt-3 text-sm leading-7 text-emerald-50">
            {manager
              ? "Escolhe um profissional da tua barbearia para veres como aparece a sua agenda. É uma pré-visualização, não uma sessão desse funcionário."
              : "A tua conta está autorizada na barbearia, mas ainda não está associada ao teu perfil profissional. Pede ao responsável que associe o teu utilizador na área Profissionais."}
          </p>
        </header>
        {manager ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="text-xl font-bold text-[#1b4634]">Escolher profissional</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {professionals.map((person) => (
                <Link key={person.id}
                  href={"/admin/" + slug + "/barbeiro?professional=" + person.id}
                  className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-4 font-semibold text-[#21543c]">
                  <span>{person.name}</span><ArrowRight className="size-4" aria-hidden />
                </Link>
              ))}
            </div>
            {professionals.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">Ainda não há profissionais ativos nesta barbearia.</p>
            ) : null}
            <Link href={"/admin/" + slug + "/professionals"}
              className="mt-5 inline-block text-sm font-semibold text-[#1a6941] underline">
              Gerir profissionais e acessos
            </Link>
          </section>
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            Ainda sem agenda individual disponível. Não são apresentados dados de outros profissionais.
          </p>
        )}
      </div>
    )
  }

  const bookings = await db.booking.findMany({
    // The DB predicate MUST contain both the tenant and the identified barber.
    where: {
      barbershopId: shopId, staffMemberId: professional.id,
      startsAt: agendaUtcSearchWindow(date),
    },
    select: {
      id: true, startsAt: true, endsAt: true, status: true,
      customerNameSnapshot: true, serviceNameSnapshot: true,
      serviceDurationMinutes: true, chairNumberSnapshot: true,
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: 500,
  })
  const dayBookings = bookings.filter((booking) =>
    localAgendaDate(booking.startsAt, timeZone) === date,
  )
  const confirmed = dayBookings.filter((booking) => booking.status === "CONFIRMED")
  const completed = dayBookings.filter((booking) => booking.status === "COMPLETED")
  const nextAppointment = confirmed.find((booking) => booking.startsAt > new Date())
  const futureDays = [date, adjacentAgendaDate(date, -1), adjacentAgendaDate(date, 1)]

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-[2rem] bg-[#143c2e] p-6 text-white shadow-lg sm:p-9">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#b1eac9]">
          <Scissors className="size-4" aria-hidden />
          {manager ? "Pré-visualização para administração" : "O meu painel de barbeiro"}
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          {professional.name}
        </h1>
        <p className="mt-2 text-sm text-[#d6e8dc]">{access.barbershop.name}</p>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[#d6e8dc]">
          A tua agenda, os serviços que vais realizar e o próximo atendimento.
          Sem acesso ao Gmail, faturação ou dados dos outros profissionais.
        </p>
        {manager ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={"/admin/" + slug + "/barbeiro"}
              className="rounded-lg border border-white/50 px-4 py-2 text-sm font-semibold">
              Mudar profissional
            </Link>
            <Link href={"/admin/" + slug + "/professionals"}
              className="rounded-lg border border-white/50 px-4 py-2 text-sm font-semibold">
              Gerir acessos
            </Link>
          </div>
        ) : null}
      </header>

      <section aria-label="Resumo das marcações" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Marcações do dia", value: dayBookings.length, icon: CalendarDays },
          { label: "Confirmadas", value: confirmed.length, icon: Clock3 },
          { label: "Concluídas", value: completed.length, icon: Scissors },
          { label: "Próxima marcação", value: nextAppointment
              ? rowTime(nextAppointment.startsAt, timeZone) : "—", icon: UserRound },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <item.icon className="size-5 text-[#317653]" aria-hidden />
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">
              {item.label}
            </p>
            <p className="mt-2 text-2xl font-black tabular-nums text-[#183b2c]">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-[#1a3c2d]">A minha agenda</h2>
            <p className="mt-1 text-sm text-gray-500">
              {date} · {timeZone} · Só marcações atribuídas a {professional.name}
            </p>
          </div>
          <Link href={link(today)}
            className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-[#27563b]">
            Hoje
          </Link>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Link href={link(futureDays[1])}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold">
            <ArrowLeft className="size-4" aria-hidden /> Anterior
          </Link>
          <Link href={link(futureDays[2])}
            className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold">
            Seguinte <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <div className="mt-6 space-y-3">
          {dayBookings.map((booking) => (
            <article key={booking.id}
              className="flex items-start gap-4 rounded-xl border border-[#e0eae2] bg-[#f8faf7] p-4">
              <div className="min-w-16 rounded-xl bg-[#e2f3e6] px-3 py-3 text-center font-black tabular-nums text-[#1e5d39]">
                {rowTime(booking.startsAt, timeZone)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[#173a29]">{booking.customerNameSnapshot}</p>
                <p className="mt-1 text-sm text-gray-700">
                  {booking.serviceNameSnapshot} · {booking.serviceDurationMinutes} min
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Cadeira {booking.chairNumberSnapshot} · {statusLabels[booking.status]}
                </p>
              </div>
            </article>
          ))}
          {dayBookings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
              <CalendarDays className="mx-auto size-8 text-[#74947b]" aria-hidden />
              <p className="mt-3 font-semibold text-[#294835]">Sem marcações neste dia</p>
              <p className="mt-1 text-sm text-gray-500">Consulta outra data na tua agenda.</p>
            </div>
          ) : null}
        </div>
      </section>
      <p className="text-xs leading-6 text-gray-500">
        Este é o painel individual, com consulta de marcações. Alterar horários,
        cancelar reservas, configurar cadeiras e gerir pagamentos continuam operações
        reservadas à administração da barbearia.
      </p>
    </div>
  )
}

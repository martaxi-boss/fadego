import { db } from "@/lib/prisma"
import { requireBarbershopBySlug } from "@/lib/authorization"
import ConfigNotice from "@/app/_components/config-notice"
import { saveOpeningHourAction } from "../actions"

const weekdays = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
] as const

const firstNotice = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value

const formatMinutes = (minutes: number | null) => {
  if (minutes === null) return ""
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
}

export default async function HoursPage({
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

  const openingHours = await db.openingHour.findMany({
    where: { barbershopId: access.barbershop.id },
    orderBy: { weekday: "asc" },
  })
  const byWeekday = new Map(
    openingHours.map((openingHour) => [openingHour.weekday, openingHour]),
  )

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Horários</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Horário semanal geral da barbearia. Um dia fechado é persistido sem
          intervalo de disponibilidade. Horários específicos por profissional e
          exceções ficam para gates posteriores.
        </p>
      </section>

      <ConfigNotice notice={firstNotice(query.notice)} />

      {!canManage ? (
        <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
          A tua role STAFF permite consultar esta configuração, mas não
          alterá-la.
        </p>
      ) : null}

      <section className="space-y-3">
        {weekdays.map((label, weekday) => {
          const openingHour = byWeekday.get(weekday)
          const saveAction = saveOpeningHourAction.bind(
            null,
            access.barbershop.slug,
            openingHour?.id ?? "",
          )
          const isClosed = openingHour?.isClosed ?? true
          const opensAt = formatMinutes(openingHour?.opensAt ?? null) || "09:00"
          const closesAt =
            formatMinutes(openingHour?.closesAt ?? null) || "18:00"

          return (
            <article
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              key={weekday}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{label}</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {openingHour
                      ? isClosed
                        ? "Fechado"
                        : `${formatMinutes(openingHour.opensAt)}–${formatMinutes(openingHour.closesAt)}`
                      : "Ainda não configurado"}
                  </p>
                </div>
              </div>

              {canManage ? (
                <form
                  action={saveAction}
                  className="mt-4 grid gap-4 md:grid-cols-4"
                >
                  <input name="weekday" type="hidden" value={weekday} />
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">Dia</span>
                    <select
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      defaultValue={isClosed ? "true" : "false"}
                      name="isClosed"
                    >
                      <option value="false">Aberto</option>
                      <option value="true">Fechado</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">
                      Abertura
                    </span>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      defaultValue={opensAt}
                      name="opensAt"
                      type="time"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">
                      Fecho
                    </span>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      defaultValue={closesAt}
                      name="closesAt"
                      type="time"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium"
                      type="submit"
                    >
                      Guardar dia
                    </button>
                  </div>
                </form>
              ) : null}
            </article>
          )
        })}
      </section>
    </div>
  )
}

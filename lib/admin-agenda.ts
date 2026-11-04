const DAY_MS = 24 * 60 * 60 * 1000

export const isValidAgendaDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + "T00:00:00.000Z")
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const resolveAgendaTimezone = (timeZone: string | null): string => {
  if (!timeZone) return "UTC"
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return timeZone
  } catch {
    return "UTC"
  }
}

export const localAgendaDate = (date: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? ""
  return [part("year"), part("month"), part("day")].join("-")
}

export const adjacentAgendaDate = (date: string, offset: number): string => {
  if (!isValidAgendaDate(date) || !Number.isInteger(offset) || Math.abs(offset) > 7) {
    throw new Error("Invalid agenda date")
  }
  return new Date(Date.parse(date + "T12:00:00.000Z") + offset * DAY_MS)
    .toISOString().slice(0, 10)
}

// A broad UTC window covers every IANA timezone, including DST transitions.
// Filter rows to the exact tenant-local date after the tenant-scoped query.
export const agendaUtcSearchWindow = (date: string, days = 1) => {
  if (!isValidAgendaDate(date)) throw new Error("Invalid agenda date")
  if (!Number.isInteger(days) || days < 1 || days > 7) throw new Error("Invalid agenda range")
  const midnight = Date.parse(date + "T00:00:00.000Z")
  return {
    gte: new Date(midnight - DAY_MS),
    lt: new Date(midnight + (days + 1) * DAY_MS),
  }
}

export const agendaDates = (date: string, view: unknown): string[] => {
  if (!isValidAgendaDate(date)) throw new Error("Invalid agenda date")
  if (view !== "week") return [date]
  const weekday = new Date(date + "T12:00:00Z").getUTCDay()
  const monday = adjacentAgendaDate(date, -((weekday + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => adjacentAgendaDate(monday, index))
}

export const agendaLocalMinute = (date: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date)
  return Number(parts.find((part) => part.type === "hour")?.value) * 60 +
    Number(parts.find((part) => part.type === "minute")?.value)
}

export const agendaDisplayInterval = (booking: { startsAt: Date; endsAt: Date }, timeZone: string) => {
  const from = agendaLocalMinute(booking.startsAt, timeZone)
  const localEnd = localAgendaDate(booking.endsAt, timeZone) === localAgendaDate(booking.startsAt, timeZone)
    ? agendaLocalMinute(booking.endsAt, timeZone) : 1440
  // A repeated clock hour at the autumn DST change must still be selectable.
  const to = localEnd > from ? localEnd : Math.min(1440, from +
    Math.max(1, (booking.endsAt.getTime() - booking.startsAt.getTime()) / 60000))
  return { from, to }
}

/** Display lanes only: concurrent appointments must remain individually selectable. */
export const agendaEventLanes = <T extends { id: string; startsAt: Date; endsAt: Date }>(
  bookings: readonly T[],
): { booking: T; lane: number; lanes: number }[] => {
  const sorted = [...bookings].sort((a, b) =>
    a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id),
  )
  const result: { booking: T; lane: number; lanes: number }[] = []
  let cluster: typeof result = []
  let clusterEnd = -Infinity
  let laneEnds: number[] = []
  const finish = () => {
    for (const event of cluster) event.lanes = laneEnds.length
    cluster = []
    laneEnds = []
  }
  for (const booking of sorted) {
    if (booking.startsAt.getTime() >= clusterEnd) finish()
    let lane = laneEnds.findIndex((end) => end <= booking.startsAt.getTime())
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = booking.endsAt.getTime()
    clusterEnd = cluster.length === 0 ? booking.endsAt.getTime() : Math.max(clusterEnd, booking.endsAt.getTime())
    const event = { booking, lane, lanes: 1 }
    cluster.push(event)
    result.push(event)
  }
  finish()
  return result
}

/** Only accept professionals that belong to the tenant being viewed. */
export const resolveAgendaProfessionalFilter = (
  value: unknown,
  tenantProfessionalIds: readonly string[],
): string => {
  if (value === "ALL" || value === "GENERAL") return value
  return typeof value === "string" && tenantProfessionalIds.includes(value)
    ? value
    : "ALL"
}


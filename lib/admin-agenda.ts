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
export const agendaUtcSearchWindow = (date: string) => {
  if (!isValidAgendaDate(date)) throw new Error("Invalid agenda date")
  const midnight = Date.parse(date + "T00:00:00.000Z")
  return {
    gte: new Date(midnight - DAY_MS),
    lt: new Date(midnight + 2 * DAY_MS),
  }
}

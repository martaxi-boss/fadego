import type { Prisma } from "@prisma/client"
import { isValidAgendaDate } from "@/lib/admin-agenda"

export type StaffSchedule = {
  weekday: number
  isClosed: boolean
  opensAt: number
  closesAt: number
  blocks: Array<{ startsMinute: number; endsMinute: number }>
}

const localPart = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date)
  const part = (name: string) => parts.find((x) => x.type === name)?.value ?? ""
  const dateKey = [part("year"), part("month"), part("day")].join("-")
  return { dateKey, minute: Number(part("hour")) * 60 + Number(part("minute")) }
}

export const staffCalendarParts = localPart
export const staffCalendarWeekday = (localDate: string) => {
  if (!isValidAgendaDate(localDate)) throw new Error("INVALID_STAFF_DATE")
  return (new Date(localDate + "T12:00:00.000Z").getUTCDay() + 6) % 7
}

export const staffScheduleAllows = (
  schedule: StaffSchedule,
  startMinute: number,
  endMinute: number,
): boolean =>
  !schedule.isClosed &&
  startMinute >= schedule.opensAt &&
  endMinute <= schedule.closesAt &&
  endMinute > startMinute &&
  !schedule.blocks.some((block) =>
    startMinute < block.endsMinute && endMinute > block.startsMinute)

export const loadStaffSchedule = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  staffMemberId: string,
  localDate: string,
): Promise<StaffSchedule> => {
  const weekday = staffCalendarWeekday(localDate)
  const [hours, blocks] = await Promise.all([
    tx.staffWeeklyHour.findUnique({
      where: { barbershopId_staffMemberId_weekday: {
        barbershopId, staffMemberId, weekday,
      } },
      select: { isClosed: true, opensAt: true, closesAt: true },
    }),
    tx.staffScheduleBlock.findMany({
      where: { barbershopId, staffMemberId, localDate },
      select: { startsMinute: true, endsMinute: true },
    }),
  ])
  return {
    weekday,
    isClosed: hours?.isClosed ?? false,
    opensAt: hours?.opensAt ?? 0,
    closesAt: hours?.closesAt ?? 1440,
    blocks,
  }
}

export const staffSlotAllowed = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  staffMemberId: string,
  timezone: string,
  start: Date,
  end: Date,
) => {
  const from = localPart(start, timezone)
  const to = localPart(end, timezone)
  if (from.dateKey !== to.dateKey || to.minute <= from.minute) return false
  const schedule = await loadStaffSchedule(tx, barbershopId, staffMemberId, from.dateKey)
  return staffScheduleAllows(schedule, from.minute, to.minute)
}

export const minuteString = (minute: number) =>
  String(Math.floor(minute / 60)).padStart(2, "0") + ":" +
  String(minute % 60).padStart(2, "0")

export const parseMinuteString = (input: unknown) => {
  if (typeof input !== "string" || !/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(input)) return null
  return Number(input.slice(0, 2)) * 60 + Number(input.slice(3, 5))
}

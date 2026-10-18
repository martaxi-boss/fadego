import { db } from "@/lib/prisma"
import { requireBarbershopBySlug } from "@/lib/authorization"
import { acquireTenantBookingLock } from "@/lib/tenant-booking-lock"
import { agendaUtcSearchWindow, isValidAgendaDate } from "@/lib/admin-agenda"
import { resolveStaffPanelTarget } from "@/lib/staff-panel-policy"
import {
  parseMinuteString, staffCalendarParts, staffCalendarWeekday,
} from "@/lib/staff-schedule"

export class StaffPlanningError extends Error {
  constructor(readonly code:
    | "NO_PROFILE" | "INVALID_INPUT" | "HAS_BOOKINGS" | "DUPLICATE"
    | "NOT_FOUND" | "UNAVAILABLE") {
    super("Não foi possível atualizar a agenda deste profissional.")
  }
}

export const requireStaffScope = async (slug: string, chosenId?: unknown) => {
  const access = await requireBarbershopBySlug(slug, ["OWNER", "ADMIN", "STAFF"])
  const target = resolveStaffPanelTarget(access.membership.role, access.user.id, chosenId)
  if (target.mode === "choose") throw new StaffPlanningError("NO_PROFILE")
  const staffMember = await db.staffMember.findFirst({
    where: {
      barbershopId: access.barbershop.id, active: true, archivedAt: null,
      ...(target.mode === "own"
        ? { userId: target.userId }
        : { id: target.professionalId }),
    },
    select: { id: true, name: true },
  })
  if (!staffMember) throw new StaffPlanningError("NO_PROFILE")
  return {
    shop: access.barbershop,
    userId: access.user.id,
    role: access.membership.role,
    staffMember,
  }
}

type StaffScope = Awaited<ReturnType<typeof requireStaffScope>>

const verifyBookingWindow = async (
  tx: import("@prisma/client").Prisma.TransactionClient,
  scope: StaffScope,
  check: (date: string, fromMinute: number, toMinute: number) => boolean,
) => {
  const tenant = await tx.barbershop.findUnique({
    where: { id: scope.shop.id }, select: { timezone: true },
  })
  if (!tenant?.timezone) throw new StaffPlanningError("UNAVAILABLE")
  const bookings = await tx.booking.findMany({
    where: {
      barbershopId: scope.shop.id, staffMemberId: scope.staffMember.id,
      status: { in: ["CONFIRMED", "NEEDS_REASSIGNMENT"] },
      endsAt: { gt: new Date() },
    },
    select: { startsAt: true, endsAt: true },
  })
  for (const item of bookings) {
    const a = staffCalendarParts(item.startsAt, tenant.timezone)
    const b = staffCalendarParts(item.endsAt, tenant.timezone)
    if (a.dateKey === b.dateKey && check(a.dateKey, a.minute, b.minute)) {
      throw new StaffPlanningError("HAS_BOOKINGS")
    }
  }
}

export const updateStaffWeeklyHour = async (
  scope: StaffScope,
  input: { weekday: number; defaultHours: boolean; isClosed: boolean;
    opensAt: string; closesAt: string },
) => {
  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) {
    throw new StaffPlanningError("INVALID_INPUT")
  }
  const opensAt = parseMinuteString(input.opensAt)
  const closesAt = input.closesAt === "24:00" ? 1440 : parseMinuteString(input.closesAt)
  if (!input.defaultHours && !input.isClosed &&
      (opensAt === null || closesAt === null || opensAt >= closesAt)) {
    throw new StaffPlanningError("INVALID_INPUT")
  }
  await db.$transaction(async (tx) => {
    await acquireTenantBookingLock(tx, scope.shop.id)
    if (!input.defaultHours) {
      await verifyBookingWindow(tx, scope, (date, from, to) =>
        staffCalendarWeekday(date) === input.weekday &&
        (input.isClosed || from < opensAt! || to > closesAt!))
    }
    const key = {
      barbershopId: scope.shop.id,
      staffMemberId: scope.staffMember.id,
      weekday: input.weekday,
    }
    if (input.defaultHours) {
      await tx.staffWeeklyHour.deleteMany({ where: key })
      return
    }
    await tx.staffWeeklyHour.upsert({
      where: { barbershopId_staffMemberId_weekday: key },
      create: {
        ...key, isClosed: input.isClosed,
        opensAt: input.isClosed ? null : opensAt,
        closesAt: input.isClosed ? null : closesAt,
      },
      update: {
        isClosed: input.isClosed,
        opensAt: input.isClosed ? null : opensAt,
        closesAt: input.isClosed ? null : closesAt,
      },
    })
  })
}

export const addStaffScheduleBlock = async (
  scope: StaffScope,
  input: { localDate: string; fullDay: boolean; opensAt: string;
    closesAt: string; label: string },
) => {
  if (!isValidAgendaDate(input.localDate) || input.label.length > 80) {
    throw new StaffPlanningError("INVALID_INPUT")
  }
  const opensAt = input.fullDay ? 0 : parseMinuteString(input.opensAt)
  const closesAt = input.fullDay ? 1440 :
    input.closesAt === "24:00" ? 1440 : parseMinuteString(input.closesAt)
  if (opensAt === null || closesAt === null || opensAt >= closesAt) {
    throw new StaffPlanningError("INVALID_INPUT")
  }
  const todayTenant = await db.barbershop.findUnique({
    where: { id: scope.shop.id }, select: { timezone: true },
  })
  if (!todayTenant?.timezone) throw new StaffPlanningError("UNAVAILABLE")
  const today = staffCalendarParts(new Date(), todayTenant.timezone).dateKey
  if (input.localDate < today ||
      input.localDate > new Date(Date.now() + 5 * 366 * 86400000).toISOString().slice(0, 10)) {
    throw new StaffPlanningError("INVALID_INPUT")
  }
  await db.$transaction(async (tx) => {
    await acquireTenantBookingLock(tx, scope.shop.id)
    await verifyBookingWindow(tx, scope, (date, from, to) =>
      date === input.localDate && from < closesAt && to > opensAt)
    const overlap = await tx.staffScheduleBlock.findFirst({
      where: {
        barbershopId: scope.shop.id, staffMemberId: scope.staffMember.id,
        localDate: input.localDate,
        startsMinute: { lt: closesAt }, endsMinute: { gt: opensAt },
      },
      select: { id: true },
    })
    if (overlap) throw new StaffPlanningError("DUPLICATE")
    await tx.staffScheduleBlock.create({
      data: {
        barbershopId: scope.shop.id,
        staffMemberId: scope.staffMember.id,
        localDate: input.localDate,
        startsMinute: opensAt, endsMinute: closesAt,
        label: input.label.trim() || null,
      },
    })
  })
}

export const removeStaffScheduleBlock = async (
  scope: StaffScope, blockId: string,
) => {
  await db.$transaction(async (tx) => {
    await acquireTenantBookingLock(tx, scope.shop.id)
    const removed = await tx.staffScheduleBlock.deleteMany({
      where: { id: blockId, barbershopId: scope.shop.id, staffMemberId: scope.staffMember.id },
    })
    if (removed.count !== 1) throw new StaffPlanningError("NOT_FOUND")
  })
}

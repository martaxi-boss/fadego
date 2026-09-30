import type {
  Booking,
  BookingStatus,
  Prisma,
} from "@prisma/client"
import { db } from "@/lib/prisma"
import { acquireTenantBookingLock } from "@/lib/tenant-booking-lock"

export type BookingEngineErrorCode =
  | "TENANT_UNAVAILABLE"
  | "TIMEZONE_UNAVAILABLE"
  | "CUSTOMER_UNAVAILABLE"
  | "SERVICE_UNAVAILABLE"
  | "STAFF_UNAVAILABLE"
  | "INVALID_GRID"
  | "OUTSIDE_OPENING_HOURS"
  | "NO_CAPACITY"
  | "BOOKING_UNAVAILABLE"
  | "INVALID_STATUS"
  | "PAST_START"

export class BookingEngineError extends Error {
  constructor(public readonly code: BookingEngineErrorCode) {
    super("Booking operation rejected.")
    this.name = "BookingEngineError"
  }
}

export type CreateBookingInput = {
  barbershopId: string
  customerId: string
  serviceId: string
  startsAt: Date
  requestedStaffMemberId?: string | null
}

export type BookingClock = {
  now: () => Date
}

const systemBookingClock: BookingClock = {
  now: () => new Date(),
}

type LockedChair = {
  id: string
  number: number
  mode: "WALK_IN" | "GENERAL_BOOKING" | "STAFF_BOOKING"
  staffMemberId: string | null
  active: boolean
}

type LockedStaff = {
  id: string
  name: string
  active: boolean
  archivedAt: Date | null
}

type LockedBooking = {
  id: string
  mode: "GENERAL_BOOKING" | "STAFF_BOOKING"
  status: BookingStatus
  startsAt: Date
  endsAt: Date
  serviceDurationMinutes: number
  staffMemberId: string | null
  chairId: string
}

type LocalClock = {
  dateKey: string
  weekday: number
  minute: number
}

const BLOCKING_STATUSES: BookingStatus[] = [
  "CONFIRMED",
  "NEEDS_REASSIGNMENT",
]

const weekdayIndex: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
}

const fail = (code: BookingEngineErrorCode): never => {
  throw new BookingEngineError(code)
}

const isValidDate = (value: Date) => Number.isFinite(value.getTime())

const assertGridStart = (startsAt: Date) => {
  if (
    !isValidDate(startsAt) ||
    startsAt.getTime() % (15 * 60 * 1000) !== 0
  ) {
    fail("INVALID_GRID")
  }
}

const assertFutureStart = (startsAt: Date, clock: BookingClock) => {
  const now = clock.now()
  if (!isValidDate(now) || startsAt.getTime() <= now.getTime()) {
    fail("PAST_START")
  }
}

const isValidTimezone = (timezone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date())
    return true
  } catch {
    return false
  }
}

const localClock = (value: Date, timezone: string): LocalClock => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value)

  const byType = new Map(parts.map((part) => [part.type, part.value]))
  const weekday = weekdayIndex[byType.get("weekday") ?? ""]
  const year = byType.get("year")
  const month = byType.get("month")
  const day = byType.get("day")
  const hour = Number(byType.get("hour"))
  const minute = Number(byType.get("minute"))

  if (
    weekday === undefined ||
    !year ||
    !month ||
    !day ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    fail("TIMEZONE_UNAVAILABLE")
  }

  return {
    dateKey: `${year}-${month}-${day}`,
    weekday,
    minute: hour * 60 + minute,
  }
}

const lockBarbershop = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
) => {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Barbershop"
    WHERE "id" = ${barbershopId}
    FOR SHARE
  `

  if (rows.length === 0) {
    fail("TENANT_UNAVAILABLE")
  }

  const barbershop = await tx.barbershop.findUnique({
    where: { id: barbershopId },
    select: { id: true, status: true, timezone: true },
  })

  if (!barbershop || barbershop.status !== "ACTIVE") {
    throw new BookingEngineError("TENANT_UNAVAILABLE")
  }

  const timezone = barbershop.timezone
  if (!timezone || !isValidTimezone(timezone)) {
    throw new BookingEngineError("TIMEZONE_UNAVAILABLE")
  }

  return {
    id: barbershop.id,
    timezone,
  }
}

const lockCustomer = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  customerId: string,
) => {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Customer"
    WHERE "id" = ${customerId}
      AND "barbershopId" = ${barbershopId}
    FOR SHARE
  `

  if (rows.length === 0) {
    fail("CUSTOMER_UNAVAILABLE")
  }

  const customer = await tx.customer.findUnique({
    where: {
      id_barbershopId: {
        id: customerId,
        barbershopId,
      },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
  })

  if (!customer) {
    throw new BookingEngineError("CUSTOMER_UNAVAILABLE")
  }

  return customer
}

const lockService = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  serviceId: string,
) => {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Service"
    WHERE "id" = ${serviceId}
      AND "barbershopId" = ${barbershopId}
    FOR SHARE
  `

  if (rows.length === 0) {
    fail("SERVICE_UNAVAILABLE")
  }

  const service = await tx.service.findUnique({
    where: {
      id_barbershopId: {
        id: serviceId,
        barbershopId,
      },
    },
    select: {
      id: true,
      name: true,
      price: true,
      durationMinutes: true,
      active: true,
    },
  })

  if (!service || !service.active) {
    throw new BookingEngineError("SERVICE_UNAVAILABLE")
  }

  return service
}

const validateOpeningHours = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  timezone: string,
  startsAt: Date,
  endsAt: Date,
) => {
  const start = localClock(startsAt, timezone)
  const end = localClock(endsAt, timezone)

  if (start.dateKey !== end.dateKey || end.minute < start.minute) {
    fail("OUTSIDE_OPENING_HOURS")
  }

  const openingHour = await tx.openingHour.findUnique({
    where: {
      barbershopId_weekday: {
        barbershopId,
        weekday: start.weekday,
      },
    },
    select: {
      isClosed: true,
      opensAt: true,
      closesAt: true,
    },
  })

  if (
    !openingHour ||
    openingHour.isClosed ||
    openingHour.opensAt === null ||
    openingHour.closesAt === null ||
    start.minute < openingHour.opensAt ||
    end.minute > openingHour.closesAt
  ) {
    fail("OUTSIDE_OPENING_HOURS")
  }
}

const lockGeneralChairs = (
  tx: Prisma.TransactionClient,
  barbershopId: string,
) =>
  tx.$queryRaw<LockedChair[]>`
    SELECT "id", "number", "mode", "staffMemberId", "active"
    FROM "Chair"
    WHERE "barbershopId" = ${barbershopId}
      AND "active" = true
      AND "mode" = 'GENERAL_BOOKING'
    ORDER BY "number" ASC, "id" ASC
    FOR UPDATE
  `

const lockStaffChairs = (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  staffMemberId: string,
) =>
  tx.$queryRaw<LockedChair[]>`
    SELECT "id", "number", "mode", "staffMemberId", "active"
    FROM "Chair"
    WHERE "barbershopId" = ${barbershopId}
      AND "active" = true
      AND "mode" = 'STAFF_BOOKING'
      AND "staffMemberId" = ${staffMemberId}
    ORDER BY "number" ASC, "id" ASC
    FOR UPDATE
  `

const lockStaff = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  staffMemberId: string,
) => {
  const rows = await tx.$queryRaw<LockedStaff[]>`
    SELECT "id", "name", "active", "archivedAt"
    FROM "StaffMember"
    WHERE "id" = ${staffMemberId}
      AND "barbershopId" = ${barbershopId}
    FOR UPDATE
  `

  const staff = rows[0]
  if (!staff || !staff.active || staff.archivedAt) {
    throw new BookingEngineError("STAFF_UNAVAILABLE")
  }

  return staff
}

const conflictWhere = (
  startsAt: Date,
  endsAt: Date,
  excludeBookingId?: string,
) => ({
  status: { in: BLOCKING_STATUSES },
  startsAt: { lt: endsAt },
  endsAt: { gt: startsAt },
  ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
})

const chairHasConflict = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  chairId: string,
  startsAt: Date,
  endsAt: Date,
  excludeBookingId?: string,
) =>
  (await tx.booking.count({
    where: {
      barbershopId,
      chairId,
      ...conflictWhere(startsAt, endsAt, excludeBookingId),
    },
  })) > 0

const staffHasConflict = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  staffMemberId: string,
  startsAt: Date,
  endsAt: Date,
  excludeBookingId?: string,
) =>
  (await tx.booking.count({
    where: {
      barbershopId,
      staffMemberId,
      ...conflictWhere(startsAt, endsAt, excludeBookingId),
    },
  })) > 0

const allocateGeneralChair = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  startsAt: Date,
  endsAt: Date,
  excludeBookingId?: string,
): Promise<LockedChair> => {
  const chairs = await lockGeneralChairs(tx, barbershopId)

  for (const chair of chairs) {
    if (
      !(await chairHasConflict(
        tx,
        barbershopId,
        chair.id,
        startsAt,
        endsAt,
        excludeBookingId,
      ))
    ) {
      return chair
    }
  }

  throw new BookingEngineError("NO_CAPACITY")
}

const allocateStaffChair = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  staffMemberId: string,
  startsAt: Date,
  endsAt: Date,
  excludeBookingId?: string,
): Promise<{ chair: LockedChair; staff: LockedStaff }> => {
  const chairs = await lockStaffChairs(tx, barbershopId, staffMemberId)
  const staff = await lockStaff(tx, barbershopId, staffMemberId)

  if (chairs.length === 0) {
    fail("STAFF_UNAVAILABLE")
  }

  if (
    await staffHasConflict(
      tx,
      barbershopId,
      staffMemberId,
      startsAt,
      endsAt,
      excludeBookingId,
    )
  ) {
    fail("NO_CAPACITY")
  }

  for (const chair of chairs) {
    if (
      !(await chairHasConflict(
        tx,
        barbershopId,
        chair.id,
        startsAt,
        endsAt,
        excludeBookingId,
      ))
    ) {
      return { chair, staff }
    }
  }

  throw new BookingEngineError("NO_CAPACITY")
}

const lockBooking = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  bookingId: string,
): Promise<LockedBooking> => {
  const rows = await tx.$queryRaw<LockedBooking[]>`
    SELECT
      "id",
      "mode",
      "status",
      "startsAt",
      "endsAt",
      "serviceDurationMinutes",
      "staffMemberId",
      "chairId"
    FROM "Booking"
    WHERE "id" = ${bookingId}
      AND "barbershopId" = ${barbershopId}
    FOR UPDATE
  `

  const booking = rows[0]
  if (!booking) {
    throw new BookingEngineError("BOOKING_UNAVAILABLE")
  }

  return booking
}

const isOverlapConflict = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false
  }

  const record = error as {
    code?: unknown
    message?: unknown
    cause?: unknown
    meta?: unknown
  }

  if (record.code === "23P01" || record.code === "P2004") {
    return true
  }

  if (
    typeof record.message === "string" &&
    (record.message.includes("Booking_chair_active_overlap_excl") ||
      record.message.includes("Booking_staff_active_overlap_excl") ||
      record.message.includes("exclusion constraint"))
  ) {
    return true
  }

  if (record.cause && record.cause !== error) {
    return isOverlapConflict(record.cause)
  }

  if (record.meta && record.meta !== error) {
    return isOverlapConflict(record.meta)
  }

  return false
}

export const runBookingMutation = async <T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => {
  try {
    return await db.$transaction(operation, {
      maxWait: 10_000,
      timeout: 15_000,
    })
  } catch (error) {
    if (error instanceof BookingEngineError) {
      throw error
    }

    if (isOverlapConflict(error)) {
      fail("NO_CAPACITY")
    }

    throw error
  }
}

export const createBookingInTransaction = async (
  tx: Prisma.TransactionClient,
  input: CreateBookingInput,
  clock: BookingClock = systemBookingClock,
): Promise<Booking> => {
  await acquireTenantBookingLock(tx, input.barbershopId)

  const tenant = await lockBarbershop(tx, input.barbershopId)
  const customer = await lockCustomer(
    tx,
    input.barbershopId,
    input.customerId,
  )
  const service = await lockService(tx, input.barbershopId, input.serviceId)

  const startsAt = new Date(input.startsAt)
  assertGridStart(startsAt)
  assertFutureStart(startsAt, clock)

  const endsAt = new Date(
    startsAt.getTime() + service.durationMinutes * 60 * 1000,
  )
  await validateOpeningHours(
    tx,
    input.barbershopId,
    tenant.timezone,
    startsAt,
    endsAt,
  )

  if (input.requestedStaffMemberId) {
    const allocation = await allocateStaffChair(
      tx,
      input.barbershopId,
      input.requestedStaffMemberId,
      startsAt,
      endsAt,
    )

    return tx.booking.create({
      data: {
        barbershopId: input.barbershopId,
        customerId: customer.id,
        serviceId: service.id,
        chairId: allocation.chair.id,
        staffMemberId: allocation.staff.id,
        mode: "STAFF_BOOKING",
        startsAt,
        endsAt,
        status: "CONFIRMED",
        serviceNameSnapshot: service.name,
        serviceDurationMinutes: service.durationMinutes,
        servicePriceSnapshot: service.price,
        customerNameSnapshot: customer.name,
        customerPhoneSnapshot: customer.phone,
        customerEmailSnapshot: customer.email,
        staffNameSnapshot: allocation.staff.name,
        chairNumberSnapshot: allocation.chair.number,
      },
    })
  }

  const chair = await allocateGeneralChair(
    tx,
    input.barbershopId,
    startsAt,
    endsAt,
  )

  return tx.booking.create({
    data: {
      barbershopId: input.barbershopId,
      customerId: customer.id,
      serviceId: service.id,
      chairId: chair.id,
      staffMemberId: null,
      mode: "GENERAL_BOOKING",
      startsAt,
      endsAt,
      status: "CONFIRMED",
      serviceNameSnapshot: service.name,
      serviceDurationMinutes: service.durationMinutes,
      servicePriceSnapshot: service.price,
      customerNameSnapshot: customer.name,
      customerPhoneSnapshot: customer.phone,
      customerEmailSnapshot: customer.email,
      staffNameSnapshot: null,
      chairNumberSnapshot: chair.number,
    },
  })
}

export const createBooking = async (
  input: CreateBookingInput,
  clock: BookingClock = systemBookingClock,
): Promise<Booking> =>
  runBookingMutation((tx) => createBookingInTransaction(tx, input, clock))

const cancelBooking = async (
  barbershopId: string,
  bookingId: string,
  cancellationStatus: "CANCELLED_BY_CUSTOMER" | "CANCELLED_BY_SHOP",
) =>
  runBookingMutation(async (tx) => {
    await acquireTenantBookingLock(tx, barbershopId)
    const current = await lockBooking(tx, barbershopId, bookingId)

    if (
      current.status !== "CONFIRMED" &&
      current.status !== "NEEDS_REASSIGNMENT"
    ) {
      fail("INVALID_STATUS")
    }

    return tx.booking.update({
      where: {
        id_barbershopId: {
          id: bookingId,
          barbershopId,
        },
      },
      data: {
        status: cancellationStatus,
      },
    })
  })

export const cancelBookingByCustomer = (
  barbershopId: string,
  bookingId: string,
) => cancelBooking(barbershopId, bookingId, "CANCELLED_BY_CUSTOMER")

export const cancelBookingByShop = (
  barbershopId: string,
  bookingId: string,
) => cancelBooking(barbershopId, bookingId, "CANCELLED_BY_SHOP")

export const rescheduleBooking = async (
  barbershopId: string,
  bookingId: string,
  startsAtInput: Date,
  clock: BookingClock = systemBookingClock,
) =>
  runBookingMutation(async (tx) => {
    await acquireTenantBookingLock(tx, barbershopId)
    const current = await lockBooking(tx, barbershopId, bookingId)

    if (current.status !== "CONFIRMED") {
      fail("INVALID_STATUS")
    }

    const tenant = await lockBarbershop(tx, barbershopId)
    const startsAt = new Date(startsAtInput)
    assertGridStart(startsAt)
    assertFutureStart(startsAt, clock)
    const endsAt = new Date(
      startsAt.getTime() + current.serviceDurationMinutes * 60 * 1000,
    )

    await validateOpeningHours(
      tx,
      barbershopId,
      tenant.timezone,
      startsAt,
      endsAt,
    )

    if (current.mode === "STAFF_BOOKING") {
      const staffMemberId = current.staffMemberId
      if (!staffMemberId) {
        throw new BookingEngineError("STAFF_UNAVAILABLE")
      }

      const allocation = await allocateStaffChair(
        tx,
        barbershopId,
        staffMemberId,
        startsAt,
        endsAt,
        current.id,
      )

      return tx.booking.update({
        where: {
          id_barbershopId: {
            id: current.id,
            barbershopId,
          },
        },
        data: {
          startsAt,
          endsAt,
          chairId: allocation.chair.id,
          chairNumberSnapshot: allocation.chair.number,
        },
      })
    }

    const chair = await allocateGeneralChair(
      tx,
      barbershopId,
      startsAt,
      endsAt,
      current.id,
    )

    return tx.booking.update({
      where: {
        id_barbershopId: {
          id: current.id,
          barbershopId,
        },
      },
      data: {
        startsAt,
        endsAt,
        chairId: chair.id,
        chairNumberSnapshot: chair.number,
      },
    })
  })

export const reassignBookingToStaff = async (
  barbershopId: string,
  bookingId: string,
  targetStaffMemberId: string,
) =>
  runBookingMutation(async (tx) => {
    await acquireTenantBookingLock(tx, barbershopId)
    const current = await lockBooking(tx, barbershopId, bookingId)

    if (current.status !== "NEEDS_REASSIGNMENT") {
      fail("INVALID_STATUS")
    }

    const allocation = await allocateStaffChair(
      tx,
      barbershopId,
      targetStaffMemberId,
      current.startsAt,
      current.endsAt,
      current.id,
    )

    return tx.booking.update({
      where: {
        id_barbershopId: {
          id: current.id,
          barbershopId,
        },
      },
      data: {
        chairId: allocation.chair.id,
        staffMemberId: allocation.staff.id,
        mode: "STAFF_BOOKING",
        status: "CONFIRMED",
        staffNameSnapshot: allocation.staff.name,
        chairNumberSnapshot: allocation.chair.number,
      },
    })
  })

export const reassignBookingToGeneral = async (
  barbershopId: string,
  bookingId: string,
) =>
  runBookingMutation(async (tx) => {
    await acquireTenantBookingLock(tx, barbershopId)
    const current = await lockBooking(tx, barbershopId, bookingId)

    if (current.status !== "NEEDS_REASSIGNMENT") {
      fail("INVALID_STATUS")
    }

    const chair = await allocateGeneralChair(
      tx,
      barbershopId,
      current.startsAt,
      current.endsAt,
      current.id,
    )

    return tx.booking.update({
      where: {
        id_barbershopId: {
          id: current.id,
          barbershopId,
        },
      },
      data: {
        chairId: chair.id,
        staffMemberId: null,
        mode: "GENERAL_BOOKING",
        status: "CONFIRMED",
        staffNameSnapshot: null,
        chairNumberSnapshot: chair.number,
      },
    })
  })

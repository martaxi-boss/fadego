import type { Prisma } from "@prisma/client"
import { db } from "@/lib/prisma"

export type AvailabilityErrorCode =
  | "TENANT_UNAVAILABLE"
  | "TIMEZONE_UNAVAILABLE"
  | "SERVICE_UNAVAILABLE"
  | "INVALID_LOCAL_DATE"

export class AvailabilityError extends Error {
  constructor(public readonly code: AvailabilityErrorCode) {
    super("Availability query rejected.")
    this.name = "AvailabilityError"
  }
}

export type AvailabilityMode = "GENERAL_BOOKING" | "STAFF_BOOKING"

export type AvailabilityQuery = {
  barbershopId: string
  serviceId: string
  localDate: string
  requestedStaffMemberId?: string | null
}

export type AvailabilitySlot = {
  startsAt: Date
  endsAt: Date
  localTime: string
  availableCapacity: number
}

export type AvailabilityResult = {
  localDate: string
  timezone: string
  mode: AvailabilityMode
  serviceDurationMinutes: number
  slots: AvailabilitySlot[]
}

export type AvailabilityClock = {
  now: () => Date
}

export type AvailabilityOptions = {
  clock?: AvailabilityClock
}

type CandidateRow = {
  minute: number
  startsAt: Date
  localTime: string
}

type BlockingBooking = {
  chairId: string
  staffMemberId: string | null
  startsAt: Date
  endsAt: Date
}

type LocalProjection = {
  dateKey: string
  minute: number
}

const systemAvailabilityClock: AvailabilityClock = {
  now: () => new Date(),
}

const blockingStatuses = ["CONFIRMED", "NEEDS_REASSIGNMENT"] as const

const fail = (code: AvailabilityErrorCode): never => {
  throw new AvailabilityError(code)
}

const isValidDate = (value: Date) => Number.isFinite(value.getTime())

const parseLocalDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    fail("INVALID_LOCAL_DATE")
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!isValidDate(parsed) || parsed.toISOString().slice(0, 10) !== value) {
    fail("INVALID_LOCAL_DATE")
  }

  const weekday = (parsed.getUTCDay() + 6) % 7
  return { weekday }
}

const isValidTimezone = (timezone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date())
    return true
  } catch {
    return false
  }
}

const localProjection = (
  value: Date,
  timezone: string,
): LocalProjection => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value)

  const byType = new Map(parts.map((part) => [part.type, part.value]))
  const year = byType.get("year")
  const month = byType.get("month")
  const day = byType.get("day")
  const hour = Number(byType.get("hour"))
  const minute = Number(byType.get("minute"))

  if (
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
    minute: hour * 60 + minute,
  }
}

const overlaps = (
  booking: BlockingBooking,
  startsAt: Date,
  endsAt: Date,
) =>
  booking.startsAt.getTime() < endsAt.getTime() &&
  booking.endsAt.getTime() > startsAt.getTime()

const emptyResult = (
  localDate: string,
  timezone: string,
  mode: AvailabilityMode,
  serviceDurationMinutes: number,
): AvailabilityResult => ({
  localDate,
  timezone,
  mode,
  serviceDurationMinutes,
  slots: [],
})

const resolveWallCandidates = async (
  tx: Prisma.TransactionClient,
  localDate: string,
  timezone: string,
  firstMinute: number,
  lastMinute: number,
  now: Date,
) => {
  if (firstMinute > lastMinute) {
    return []
  }

  /*
   * DST policy:
   * - a wall time with zero matching absolute instants is nonexistent and omitted;
   * - a wall time with more than one matching instant is ambiguous and omitted.
   *
   * The bounded +/- 4 hour probe is evaluated in one PostgreSQL query for all
   * candidate wall times. Modern IANA DST shifts are comfortably inside this
   * window, including 30-minute transitions. No fixed UTC offset is assumed.
   */
  return tx.$queryRaw<CandidateRow[]>`
    WITH "wall_candidates" AS (
      SELECT
        "series"."minute"::int AS "minute",
        (
          ${localDate}::date::timestamp
          + make_interval(mins => "series"."minute"::int)
        ) AS "wall"
      FROM generate_series(
        ${firstMinute}::int,
        ${lastMinute}::int,
        15
      ) AS "series"("minute")
    ),
    "resolved" AS (
      SELECT
        "minute",
        "wall",
        "wall" AT TIME ZONE ${timezone} AS "startsAt"
      FROM "wall_candidates"
    ),
    "classified" AS (
      SELECT
        "resolved"."minute",
        "resolved"."wall",
        "resolved"."startsAt",
        (
          SELECT count(*)::int
          FROM generate_series(
            "resolved"."startsAt" - INTERVAL '4 hours',
            "resolved"."startsAt" + INTERVAL '4 hours',
            INTERVAL '1 minute'
          ) AS "probe"("instant")
          WHERE
            "probe"."instant" AT TIME ZONE ${timezone}
            = "resolved"."wall"
        ) AS "mappingCount"
      FROM "resolved"
    )
    SELECT
      "minute",
      "startsAt",
      to_char("wall", 'HH24:MI') AS "localTime"
    FROM "classified"
    WHERE
      "mappingCount" = 1
      AND "startsAt" AT TIME ZONE ${timezone} = "wall"
      AND "startsAt" > ${now}
    ORDER BY "startsAt" ASC
  `
}

const generateSlots = async (
  tx: Prisma.TransactionClient,
  input: AvailabilityQuery,
  timezone: string,
  mode: AvailabilityMode,
  durationMinutes: number,
  opensAt: number,
  closesAt: number,
  now: Date,
  eligibleChairIds: string[],
  requestedStaffMemberId?: string,
): Promise<AvailabilitySlot[]> => {
  const firstMinute = Math.ceil(opensAt / 15) * 15
  const candidates = await resolveWallCandidates(
    tx,
    input.localDate,
    timezone,
    firstMinute,
    closesAt,
    now,
  )

  const boundedCandidates = candidates
    .map((candidate) => {
      const startsAt = new Date(candidate.startsAt)
      const endsAt = new Date(
        startsAt.getTime() + durationMinutes * 60 * 1000,
      )
      const endLocal = localProjection(endsAt, timezone)

      if (
        endLocal.dateKey !== input.localDate ||
        endLocal.minute < candidate.minute ||
        endLocal.minute > closesAt
      ) {
        return null
      }

      return {
        ...candidate,
        startsAt,
        endsAt,
      }
    })
    .filter(
      (
        candidate,
      ): candidate is CandidateRow & {
        startsAt: Date
        endsAt: Date
      } => candidate !== null,
    )

  if (boundedCandidates.length === 0 || eligibleChairIds.length === 0) {
    return []
  }

  const windowStart = boundedCandidates[0]?.startsAt
  const windowEnd =
    boundedCandidates[boundedCandidates.length - 1]?.endsAt

  if (!windowStart || !windowEnd) {
    return []
  }

  const bookings = await tx.booking.findMany({
    where: {
      barbershopId: input.barbershopId,
      status: { in: [...blockingStatuses] },
      startsAt: { lt: windowEnd },
      endsAt: { gt: windowStart },
      ...(requestedStaffMemberId
        ? {
            OR: [
              { chairId: { in: eligibleChairIds } },
              { staffMemberId: requestedStaffMemberId },
            ],
          }
        : { chairId: { in: eligibleChairIds } }),
    },
    select: {
      chairId: true,
      staffMemberId: true,
      startsAt: true,
      endsAt: true,
    },
  })

  const seenLocalTimes = new Set<string>()
  const slots: AvailabilitySlot[] = []

  for (const candidate of boundedCandidates) {
    if (seenLocalTimes.has(candidate.localTime)) {
      continue
    }

    if (mode === "STAFF_BOOKING" && requestedStaffMemberId) {
      const professionalBlocked = bookings.some(
        (booking) =>
          booking.staffMemberId === requestedStaffMemberId &&
          overlaps(booking, candidate.startsAt, candidate.endsAt),
      )

      if (professionalBlocked) {
        continue
      }

      const hasFreeChair = eligibleChairIds.some(
        (chairId) =>
          !bookings.some(
            (booking) =>
              booking.chairId === chairId &&
              overlaps(booking, candidate.startsAt, candidate.endsAt),
          ),
      )

      if (!hasFreeChair) {
        continue
      }

      slots.push({
        startsAt: candidate.startsAt,
        endsAt: candidate.endsAt,
        localTime: candidate.localTime,
        availableCapacity: 1,
      })
      seenLocalTimes.add(candidate.localTime)
      continue
    }

    const availableCapacity = eligibleChairIds.filter(
      (chairId) =>
        !bookings.some(
          (booking) =>
            booking.chairId === chairId &&
            overlaps(booking, candidate.startsAt, candidate.endsAt),
        ),
    ).length

    if (availableCapacity < 1) {
      continue
    }

    slots.push({
      startsAt: candidate.startsAt,
      endsAt: candidate.endsAt,
      localTime: candidate.localTime,
      availableCapacity,
    })
    seenLocalTimes.add(candidate.localTime)
  }

  return slots.sort(
    (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
  )
}

export const getAvailability = async (
  input: AvailabilityQuery,
  options: AvailabilityOptions = {},
): Promise<AvailabilityResult> => {
  const { weekday } = parseLocalDate(input.localDate)
  const mode: AvailabilityMode = input.requestedStaffMemberId
    ? "STAFF_BOOKING"
    : "GENERAL_BOOKING"
  const clock = options.clock ?? systemAvailabilityClock
  const now = clock.now()

  if (!isValidDate(now)) {
    fail("INVALID_LOCAL_DATE")
  }

  return db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY")

      const barbershop = await tx.barbershop.findUnique({
        where: { id: input.barbershopId },
        select: {
          id: true,
          status: true,
          timezone: true,
        },
      })

      if (!barbershop || barbershop.status !== "ACTIVE") {
        fail("TENANT_UNAVAILABLE")
      }

      const timezone = barbershop.timezone
      if (!timezone || !isValidTimezone(timezone)) {
        fail("TIMEZONE_UNAVAILABLE")
      }

      const service = await tx.service.findUnique({
        where: {
          id_barbershopId: {
            id: input.serviceId,
            barbershopId: input.barbershopId,
          },
        },
        select: {
          id: true,
          active: true,
          durationMinutes: true,
        },
      })

      if (
        !service ||
        !service.active ||
        service.durationMinutes <= 0 ||
        service.durationMinutes % 15 !== 0
      ) {
        fail("SERVICE_UNAVAILABLE")
      }

      const baseEmpty = () =>
        emptyResult(
          input.localDate,
          timezone,
          mode,
          service.durationMinutes,
        )

      const openingHour = await tx.openingHour.findUnique({
        where: {
          barbershopId_weekday: {
            barbershopId: input.barbershopId,
            weekday,
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
        openingHour.closesAt === null
      ) {
        return baseEmpty()
      }

      if (input.requestedStaffMemberId) {
        const staff = await tx.staffMember.findUnique({
          where: {
            id_barbershopId: {
              id: input.requestedStaffMemberId,
              barbershopId: input.barbershopId,
            },
          },
          select: {
            id: true,
            active: true,
            archivedAt: true,
          },
        })

        if (!staff?.active || staff.archivedAt) {
          return baseEmpty()
        }

        const chairs = await tx.chair.findMany({
          where: {
            barbershopId: input.barbershopId,
            active: true,
            mode: "STAFF_BOOKING",
            staffMemberId: staff.id,
          },
          select: { id: true },
          orderBy: [{ number: "asc" }, { id: "asc" }],
        })

        if (chairs.length === 0) {
          return baseEmpty()
        }

        const slots = await generateSlots(
          tx,
          input,
          timezone,
          mode,
          service.durationMinutes,
          openingHour.opensAt,
          openingHour.closesAt,
          now,
          chairs.map((chair) => chair.id),
          staff.id,
        )

        return {
          localDate: input.localDate,
          timezone,
          mode,
          serviceDurationMinutes: service.durationMinutes,
          slots,
        }
      }

      const chairs = await tx.chair.findMany({
        where: {
          barbershopId: input.barbershopId,
          active: true,
          mode: "GENERAL_BOOKING",
        },
        select: { id: true },
        orderBy: [{ number: "asc" }, { id: "asc" }],
      })

      if (chairs.length === 0) {
        return baseEmpty()
      }

      const slots = await generateSlots(
        tx,
        input,
        timezone,
        mode,
        service.durationMinutes,
        openingHour.opensAt,
        openingHour.closesAt,
        now,
        chairs.map((chair) => chair.id),
      )

      return {
        localDate: input.localDate,
        timezone,
        mode,
        serviceDurationMinutes: service.durationMinutes,
        slots,
      }
    },
    {
      isolationLevel: "RepeatableRead",
      maxWait: 5_000,
      timeout: 10_000,
    },
  )
}

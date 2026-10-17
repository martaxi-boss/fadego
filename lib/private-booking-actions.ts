import { createHash } from "node:crypto"
import { z } from "zod"
import {
  AvailabilityError,
  getBookingRescheduleAvailability,
  type AvailabilityResult,
} from "@/lib/availability"
import {
  canonicalizeAccessCode,
  hashAccessCode,
  isBookingAccessExpired,
} from "@/lib/booking-access"
import {
  BookingEngineError,
  cancelBookingByCustomer,
  rescheduleBooking,
  type BookingMutationHook,
} from "@/lib/booking-engine"
import { db } from "@/lib/prisma"
import { sealBookingEmail } from "@/lib/booking-email-crypto"
import { deliverBookingEmail } from "@/lib/booking-email"
import {
  consumeRateLimit,
  hashRateLimitKey,
  type RateLimitName,
} from "@/lib/rate-limit"

type RateLimitConsumer = (
  name: RateLimitName,
  key: string,
) => Promise<{ allowed: boolean; retryAfterSeconds: number }>

export type PrivateActionFailureCode =
  | "INVALID_INPUT"
  | "UNAVAILABLE"
  | "RATE_LIMITED"
  | "ACTION_UNAVAILABLE"
  | "SLOT_UNAVAILABLE"

export type PrivateActionResult =
  | { ok: true }
  | { ok: false; code: PrivateActionFailureCode }

export type PrivateRescheduleAvailabilityResult =
  | { ok: true; availability: AvailabilityResult }
  | { ok: false; code: PrivateActionFailureCode }

export type PrivateActionOptions = {
  sourceIp?: string
  consumeLimit?: RateLimitConsumer
  now?: () => Date
}

const localDateSchema = z
  .string()
  .length(10)
  .regex(/^\d{4}-\d{2}-\d{2}$/)

const rescheduleSchema = z.object({
  startsAt: z.coerce.date(),
})

const credentialSignal = (rawCode: string) => {
  const canonical = canonicalizeAccessCode(rawCode)
  return canonical
    ? hashAccessCode(canonical)
    : createHash("sha256")
        .update(rawCode.trim().toUpperCase(), "utf8")
        .digest("hex")
}

export const buildPrivateMutationRateLimitKey = (
  sourceIp: string,
  rawCode: string,
) =>
  hashRateLimitKey(
    "private-booking-mutation",
    sourceIp,
    credentialSignal(rawCode),
  )

const buildPrivateReadRateLimitKey = (sourceIp: string) =>
  hashRateLimitKey("private-booking-lookup", sourceIp)

type PrivateAccess = {
  barbershopId: string
  bookingId: string
  status:
    | "CONFIRMED"
    | "COMPLETED"
    | "CANCELLED_BY_CUSTOMER"
    | "CANCELLED_BY_SHOP"
    | "NO_SHOW"
    | "NEEDS_REASSIGNMENT"
  mode: "GENERAL_BOOKING" | "STAFF_BOOKING"
  staffMemberId: string | null
  serviceDurationMinutes: number
  startsAt: Date
  customerEmail: string | null
  customerName: string
  serviceName: string
  barbershopName: string
  barbershopContactEmail: string | null
  timezone: string
}

const resolvePrivateAccess = async (
  rawCode: string,
  now: Date = new Date(),
): Promise<PrivateAccess | null> => {
  const code = canonicalizeAccessCode(rawCode)
  if (!code) return null

  const token = await db.bookingAccessToken.findUnique({
    where: { tokenHash: hashAccessCode(code) },
    select: {
      revokedAt: true,
      barbershopId: true,
      bookingId: true,
      barbershop: { select: { name: true, timezone: true, contactEmail: true } },
      booking: {
        select: {
          customerEmailSnapshot: true,
          customerNameSnapshot: true,
          serviceNameSnapshot: true,
          endsAt: true,
          startsAt: true,
          status: true,
          mode: true,
          staffMemberId: true,
          serviceDurationMinutes: true,
        },
      },
    },
  })

  if (
    !token || token.revokedAt || !token.barbershop.timezone ||
    isBookingAccessExpired(token.booking.endsAt, now)
  ) {
    return null
  }

  return {
    barbershopId: token.barbershopId,
    bookingId: token.bookingId,
    status: token.booking.status,
    mode: token.booking.mode,
    staffMemberId: token.booking.staffMemberId,
    serviceDurationMinutes: token.booking.serviceDurationMinutes,
    startsAt: token.booking.startsAt,
    customerEmail: token.booking.customerEmailSnapshot,
    customerName: token.booking.customerNameSnapshot,
    serviceName: token.booking.serviceNameSnapshot,
    barbershopName: token.barbershop.name,
    barbershopContactEmail: token.barbershop.contactEmail,
    timezone: token.barbershop.timezone,
  }
}

// Snapshot a transactionally committed event, never send email inside the
// tenant lock. Legacy appointments without an email stay manageable.
const bookingActionEmail = (
  access: PrivateAccess,
  accessCode: string,
  kind: "CANCELLED" | "RESCHEDULED",
  recordJobId: (id: string) => void,
): BookingMutationHook => async (tx, updated, previousStartsAt) => {
  if (!access.customerEmail || !z.email().safeParse(access.customerEmail).success) {
    return
  }

  const sealedPayload = sealBookingEmail({
    kind,
    email: access.customerEmail.toLowerCase(),
    customerName: access.customerName.slice(0, 120),
    barbershopName: access.barbershopName.slice(0, 200),
    barbershopContactEmail: access.barbershopContactEmail ?? undefined,
    serviceName: access.serviceName.slice(0, 200),
    startsAt: updated.startsAt.toISOString(),
    timezone: access.timezone,
    previousStartsAt: kind === "RESCHEDULED"
      ? previousStartsAt.toISOString()
      : undefined,
    accessCode,
  })
  const job = await tx.bookingEmailOutbox.create({
    data: {
      barbershopId: access.barbershopId,
      bookingId: access.bookingId,
      kind,
      sealedPayload,
    },
  })
  recordJobId(job.id)
}

const trySendActionEmail = async (jobId: string | null) => {
  if (!jobId) return
  try {
    await deliverBookingEmail(jobId)
  } catch {
    // The committed outbox record is retried by the scheduled worker.
  }
}

const consumeMutationLimit = async (
  rawCode: string,
  options: PrivateActionOptions,
) => {
  const consume = options.consumeLimit ?? consumeRateLimit
  const sourceIp = options.sourceIp?.trim() || "unknown"
  const sourceBudget = await consume(
    "privateBookingMutationSource",
    hashRateLimitKey("private-booking-mutation-source", sourceIp),
  )
  if (!sourceBudget.allowed) return sourceBudget
  return consume(
    "privateBookingMutation",
    buildPrivateMutationRateLimitKey(sourceIp, rawCode),
  )
}

const consumeReadLimit = async (options: PrivateActionOptions) => {
  const consume = options.consumeLimit ?? consumeRateLimit
  const sourceIp = options.sourceIp?.trim() || "unknown"
  return consume(
    "privateBookingLookup",
    buildPrivateReadRateLimitKey(sourceIp),
  )
}

export const cancelPrivateBooking = async (
  rawCode: string,
  options: PrivateActionOptions = {},
): Promise<PrivateActionResult> => {
  const limiter = await consumeMutationLimit(rawCode, options)
  if (!limiter.allowed) {
    return { ok: false, code: "RATE_LIMITED" }
  }

  const access = await resolvePrivateAccess(rawCode, options.now?.() ?? new Date())
  if (!access) {
    return { ok: false, code: "UNAVAILABLE" }
  }

  if (
    (access.status !== "CONFIRMED" && access.status !== "NEEDS_REASSIGNMENT") ||
    access.startsAt <= (options.now?.() ?? new Date())
  ) {
    return { ok: false, code: "ACTION_UNAVAILABLE" }
  }

  try {
    let notificationId: string | null = null
    await cancelBookingByCustomer(
      access.barbershopId,
      access.bookingId,
      { now: options.now ?? (() => new Date()) },
      bookingActionEmail(
        access,
        canonicalizeAccessCode(rawCode)!,
        "CANCELLED",
        (id) => { notificationId = id },
      ),
    )
    await trySendActionEmail(notificationId)
    return { ok: true }
  } catch (error) {
    if (
      error instanceof BookingEngineError &&
      (error.code === "INVALID_STATUS" || error.code === "ACTION_TOO_LATE")
    ) {
      return { ok: false, code: "ACTION_UNAVAILABLE" }
    }

    if (error instanceof BookingEngineError) {
      return { ok: false, code: "UNAVAILABLE" }
    }

    return { ok: false, code: "UNAVAILABLE" }
  }
}

export const getPrivateRescheduleAvailability = async (
  rawCode: string,
  rawLocalDate: unknown,
  options: PrivateActionOptions = {},
): Promise<PrivateRescheduleAvailabilityResult> => {
  const limiter = await consumeReadLimit(options)
  if (!limiter.allowed) {
    return { ok: false, code: "RATE_LIMITED" }
  }

  const localDate = localDateSchema.safeParse(rawLocalDate)
  if (!localDate.success) {
    return { ok: false, code: "INVALID_INPUT" }
  }

  const access = await resolvePrivateAccess(rawCode, options.now?.() ?? new Date())
  if (!access) {
    return { ok: false, code: "UNAVAILABLE" }
  }

  if (access.status !== "CONFIRMED" || access.startsAt <= (options.now?.() ?? new Date())) {
    return { ok: false, code: "ACTION_UNAVAILABLE" }
  }

  if (access.mode === "STAFF_BOOKING" && !access.staffMemberId) {
    return { ok: false, code: "ACTION_UNAVAILABLE" }
  }

  try {
    const availability = await getBookingRescheduleAvailability({
      barbershopId: access.barbershopId,
      localDate: localDate.data,
      mode: access.mode,
      durationMinutes: access.serviceDurationMinutes,
      requestedStaffMemberId: access.staffMemberId,
      excludeBookingId: access.bookingId,
    })

    return { ok: true, availability }
  } catch (error) {
    if (
      error instanceof AvailabilityError &&
      error.code === "INVALID_LOCAL_DATE"
    ) {
      return { ok: false, code: "INVALID_INPUT" }
    }

    if (
      error instanceof AvailabilityError &&
      error.code === "STAFF_UNAVAILABLE"
    ) {
      return { ok: false, code: "ACTION_UNAVAILABLE" }
    }

    if (error instanceof AvailabilityError) {
      return { ok: false, code: "UNAVAILABLE" }
    }

    return { ok: false, code: "UNAVAILABLE" }
  }
}

export const reschedulePrivateBooking = async (
  rawCode: string,
  rawInput: unknown,
  options: PrivateActionOptions = {},
): Promise<PrivateActionResult> => {
  const limiter = await consumeMutationLimit(rawCode, options)
  if (!limiter.allowed) {
    return { ok: false, code: "RATE_LIMITED" }
  }

  const parsed = rescheduleSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, code: "INVALID_INPUT" }
  }

  const access = await resolvePrivateAccess(rawCode, options.now?.() ?? new Date())
  if (!access) {
    return { ok: false, code: "UNAVAILABLE" }
  }

  if (access.status !== "CONFIRMED" || access.startsAt <= (options.now?.() ?? new Date())) {
    return { ok: false, code: "ACTION_UNAVAILABLE" }
  }

  try {
    let notificationId: string | null = null
    await rescheduleBooking(
      access.barbershopId,
      access.bookingId,
      parsed.data.startsAt,
      { now: options.now ?? (() => new Date()) },
      bookingActionEmail(
        access,
        canonicalizeAccessCode(rawCode)!,
        "RESCHEDULED",
        (id) => { notificationId = id },
      ),
    )
    await trySendActionEmail(notificationId)
    return { ok: true }
  } catch (error) {
    if (error instanceof BookingEngineError) {
      switch (error.code) {
        case "NO_CAPACITY":
        case "OUTSIDE_OPENING_HOURS":
        case "INVALID_GRID":
        case "PAST_START":
          return { ok: false, code: "SLOT_UNAVAILABLE" }
        case "STAFF_UNAVAILABLE":
        case "INVALID_STATUS":
        case "ACTION_TOO_LATE":
          return { ok: false, code: "ACTION_UNAVAILABLE" }
        default:
          return { ok: false, code: "UNAVAILABLE" }
      }
    }

    return { ok: false, code: "UNAVAILABLE" }
  }
}

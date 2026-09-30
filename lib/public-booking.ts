import type { Prisma } from "@prisma/client"
import { z } from "zod"
import {
  AvailabilityError,
  getAvailability,
  type AvailabilityClock,
  type AvailabilityResult,
} from "@/lib/availability"
import {
  bookingAccessPath,
  canonicalizeAccessCode,
  hashAccessCode,
  issueBookingAccessToken,
  type AccessCodeGenerator,
  BookingAccessError,
} from "@/lib/booking-access"
import {
  BookingEngineError,
  createBookingInTransaction,
  runBookingMutation,
  type BookingClock,
} from "@/lib/booking-engine"
import { db } from "@/lib/prisma"
import {
  consumeRateLimit,
  hashRateLimitKey,
  type RateLimitName,
} from "@/lib/rate-limit"
import { acquireTenantBookingLock } from "@/lib/tenant-booking-lock"
import { barbershopSlugSchema } from "@/lib/validation"

const publicEmailSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0
      ? undefined
      : value,
  z.string().trim().toLowerCase().email().max(254).optional(),
)

export const publicCustomerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .min(6)
    .max(32)
    .regex(/^\+?[0-9](?:[0-9\s().-]{4,30})[0-9]$/),
  email: publicEmailSchema,
})

const optionalStaffIdSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.string().uuid().optional(),
)

export const publicBookingInputSchema = z.object({
  barbershopSlug: barbershopSlugSchema,
  serviceId: z.string().uuid(),
  requestedStaffMemberId: optionalStaffIdSchema,
  startsAt: z.coerce.date(),
  customer: publicCustomerSchema,
})

export const publicAvailabilityInputSchema = z.object({
  barbershopSlug: barbershopSlugSchema,
  serviceId: z.string().uuid(),
  requestedStaffMemberId: optionalStaffIdSchema,
  localDate: z.string().min(1).max(10),
})

export type PublicBookingInput = z.input<typeof publicBookingInputSchema>
export type PublicAvailabilityInput = z.input<
  typeof publicAvailabilityInputSchema
>

export type PublicBookingFailureCode =
  | "INVALID_INPUT"
  | "TENANT_UNAVAILABLE"
  | "SERVICE_UNAVAILABLE"
  | "STAFF_UNAVAILABLE"
  | "SLOT_UNAVAILABLE"
  | "RATE_LIMITED"
  | "UNAVAILABLE"

export type PublicBookingResult =
  | {
      ok: true
      accessCode: string
      accessPath: string
    }
  | {
      ok: false
      code: PublicBookingFailureCode
    }

export type PublicAvailabilityResult =
  | {
      ok: true
      availability: AvailabilityResult
    }
  | {
      ok: false
      code: "INVALID_INPUT" | "UNAVAILABLE"
    }

export type PublicCatalog = {
  slug: string
  name: string
  logoUrl: string | null
  address: string | null
  phone: string | null
  instagramLabel: string | null
  instagramUrl: string | null
  officialWebsiteLabel: string | null
  officialWebsiteUrl: string | null
  services: Array<{
    id: string
    name: string
    description: string | null
    price: string
    durationMinutes: number
  }>
  generalAvailable: boolean
  professionals: Array<{
    id: string
    name: string
    photoUrl: string | null
  }>
}

export type PrivateBookingProjection = {
  serviceName: string
  localDate: string
  localTime: string
  timezone: string
  durationMinutes: number
  professionalName: string | null
  customerName: string
  status:
    | "CONFIRMED"
    | "COMPLETED"
    | "CANCELLED_BY_CUSTOMER"
    | "CANCELLED_BY_SHOP"
    | "NO_SHOW"
    | "NEEDS_REASSIGNMENT"
}

export type PrivateBookingLookupResult =
  | { ok: true; booking: PrivateBookingProjection }
  | { ok: false; code: "UNAVAILABLE" | "RATE_LIMITED" }

type RateLimitConsumer = (
  name: RateLimitName,
  key: string,
) => Promise<{ allowed: boolean; retryAfterSeconds: number }>

export type PublicBookingOptions = {
  sourceIp?: string
  clock?: BookingClock
  accessCodeGenerator?: AccessCodeGenerator
  consumeLimit?: RateLimitConsumer
}

export type PublicAvailabilityOptions = {
  clock?: AvailabilityClock
}

export type PrivateLookupOptions = {
  sourceIp?: string
  consumeLimit?: RateLimitConsumer
}

const safeHttpUrl = (value: string | null) => {
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null
  } catch {
    return null
  }
}

const resolveActiveTenant = async (slug: string) => {
  const tenant = await db.barbershop.findUnique({
    where: { slug },
    select: { id: true, status: true },
  })

  return tenant?.status === "ACTIVE" ? tenant : null
}

export const buildPublicCreateRateLimitKey = (
  barbershopId: string,
  sourceIp: string,
  normalizedPhone: string,
) =>
  hashRateLimitKey(
    "public-booking-create",
    barbershopId,
    sourceIp,
    normalizedPhone,
  )

export const buildPrivateLookupRateLimitKey = (sourceIp: string) =>
  hashRateLimitKey("private-booking-lookup", sourceIp)

export const getPublicCatalog = async (
  rawSlug: string,
): Promise<PublicCatalog | null> => {
  const slug = barbershopSlugSchema.safeParse(rawSlug)
  if (!slug.success) return null

  const barbershop = await db.barbershop.findUnique({
    where: { slug: slug.data },
    select: {
      slug: true,
      name: true,
      logoUrl: true,
      address: true,
      phone: true,
      instagram: true,
      officialWebsite: true,
      status: true,
      services: {
        where: { active: true },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          durationMinutes: true,
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      },
      chairs: {
        where: {
          active: true,
          mode: "GENERAL_BOOKING",
        },
        select: { id: true },
        take: 1,
      },
      staffMembers: {
        where: {
          active: true,
          archivedAt: null,
          chairs: {
            some: {
              active: true,
              mode: "STAFF_BOOKING",
            },
          },
        },
        select: {
          id: true,
          name: true,
          photoUrl: true,
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      },
    },
  })

  if (!barbershop || barbershop.status !== "ACTIVE") {
    return null
  }

  return {
    slug: barbershop.slug,
    name: barbershop.name,
    logoUrl: safeHttpUrl(barbershop.logoUrl),
    address: barbershop.address,
    phone: barbershop.phone,
    instagramLabel: barbershop.instagram,
    instagramUrl: safeHttpUrl(barbershop.instagram),
    officialWebsiteLabel: barbershop.officialWebsite,
    officialWebsiteUrl: safeHttpUrl(barbershop.officialWebsite),
    services: barbershop.services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      price: service.price.toString(),
      durationMinutes: service.durationMinutes,
    })),
    generalAvailable: barbershop.chairs.length > 0,
    professionals: barbershop.staffMembers.map((staff) => ({
      id: staff.id,
      name: staff.name,
      photoUrl: safeHttpUrl(staff.photoUrl),
    })),
  }
}

export const getPublicAvailability = async (
  input: PublicAvailabilityInput,
  options: PublicAvailabilityOptions = {},
): Promise<PublicAvailabilityResult> => {
  const parsed = publicAvailabilityInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "INVALID_INPUT" }
  }

  const tenant = await resolveActiveTenant(parsed.data.barbershopSlug)
  if (!tenant) {
    return { ok: false, code: "UNAVAILABLE" }
  }

  try {
    const availability = await getAvailability(
      {
        barbershopId: tenant.id,
        serviceId: parsed.data.serviceId,
        localDate: parsed.data.localDate,
        requestedStaffMemberId: parsed.data.requestedStaffMemberId,
      },
      { clock: options.clock },
    )

    return { ok: true, availability }
  } catch (error) {
    if (
      error instanceof AvailabilityError &&
      error.code === "INVALID_LOCAL_DATE"
    ) {
      return { ok: false, code: "INVALID_INPUT" }
    }

    if (error instanceof AvailabilityError) {
      return { ok: false, code: "UNAVAILABLE" }
    }

    throw error
  }
}

const createCustomer = (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  customer: z.output<typeof publicCustomerSchema>,
) =>
  tx.customer.create({
    data: {
      barbershopId,
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? null,
    },
  })

const mapBookingFailure = (error: BookingEngineError): PublicBookingResult => {
  switch (error.code) {
    case "NO_CAPACITY":
    case "OUTSIDE_OPENING_HOURS":
    case "INVALID_GRID":
    case "PAST_START":
      return { ok: false, code: "SLOT_UNAVAILABLE" }
    case "STAFF_UNAVAILABLE":
      return { ok: false, code: "STAFF_UNAVAILABLE" }
    case "SERVICE_UNAVAILABLE":
      return { ok: false, code: "SERVICE_UNAVAILABLE" }
    case "TENANT_UNAVAILABLE":
    case "TIMEZONE_UNAVAILABLE":
      return { ok: false, code: "TENANT_UNAVAILABLE" }
    default:
      return { ok: false, code: "UNAVAILABLE" }
  }
}

export const createPublicBooking = async (
  input: PublicBookingInput,
  options: PublicBookingOptions = {},
): Promise<PublicBookingResult> => {
  const parsed = publicBookingInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "INVALID_INPUT" }
  }

  const tenant = await resolveActiveTenant(parsed.data.barbershopSlug)
  if (!tenant) {
    return { ok: false, code: "TENANT_UNAVAILABLE" }
  }

  const sourceIp = options.sourceIp?.trim() || "unknown"
  const consumeLimit = options.consumeLimit ?? consumeRateLimit
  const limiter = await consumeLimit(
    "publicBookingCreate",
    buildPublicCreateRateLimitKey(
      tenant.id,
      sourceIp,
      parsed.data.customer.phone,
    ),
  )

  if (!limiter.allowed) {
    return { ok: false, code: "RATE_LIMITED" }
  }

  try {
    return await runBookingMutation(async (tx) => {
      const authoritativeTenant = await tx.barbershop.findUnique({
        where: { slug: parsed.data.barbershopSlug },
        select: { id: true, status: true },
      })

      if (!authoritativeTenant || authoritativeTenant.status !== "ACTIVE") {
        throw new BookingEngineError("TENANT_UNAVAILABLE")
      }

      await acquireTenantBookingLock(tx, authoritativeTenant.id)

      const customer = await createCustomer(
        tx,
        authoritativeTenant.id,
        parsed.data.customer,
      )

      const booking = await createBookingInTransaction(
        tx,
        {
          barbershopId: authoritativeTenant.id,
          customerId: customer.id,
          serviceId: parsed.data.serviceId,
          startsAt: parsed.data.startsAt,
          requestedStaffMemberId: parsed.data.requestedStaffMemberId,
        },
        options.clock,
      )

      const accessCode = await issueBookingAccessToken(tx, {
        barbershopId: authoritativeTenant.id,
        bookingId: booking.id,
        generator: options.accessCodeGenerator,
      })

      return {
        ok: true as const,
        accessCode,
        accessPath: bookingAccessPath(accessCode),
      }
    })
  } catch (error) {
    if (error instanceof BookingEngineError) {
      return mapBookingFailure(error)
    }

    if (error instanceof BookingAccessError) {
      return { ok: false, code: "UNAVAILABLE" }
    }

    return { ok: false, code: "UNAVAILABLE" }
  }
}

const localBookingTime = (value: Date, timezone: string) => {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
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
    const hour = byType.get("hour")
    const minute = byType.get("minute")

    if (!year || !month || !day || !hour || !minute) {
      return null
    }

    return {
      localDate: `${year}-${month}-${day}`,
      localTime: `${hour}:${minute}`,
    }
  } catch {
    return null
  }
}

export const lookupPrivateBooking = async (
  rawCode: string,
  options: PrivateLookupOptions = {},
): Promise<PrivateBookingLookupResult> => {
  const sourceIp = options.sourceIp?.trim() || "unknown"
  const consumeLimit = options.consumeLimit ?? consumeRateLimit
  const limiter = await consumeLimit(
    "privateBookingLookup",
    buildPrivateLookupRateLimitKey(sourceIp),
  )

  if (!limiter.allowed) {
    return { ok: false, code: "RATE_LIMITED" }
  }

  const accessCode = canonicalizeAccessCode(rawCode)
  if (!accessCode) {
    return { ok: false, code: "UNAVAILABLE" }
  }

  const access = await db.bookingAccessToken.findUnique({
    where: { tokenHash: hashAccessCode(accessCode) },
    select: {
      revokedAt: true,
      barbershop: {
        select: {
          timezone: true,
        },
      },
      booking: {
        select: {
          startsAt: true,
          status: true,
          serviceNameSnapshot: true,
          serviceDurationMinutes: true,
          customerNameSnapshot: true,
          staffNameSnapshot: true,
        },
      },
    },
  })

  if (!access || access.revokedAt || !access.barbershop.timezone) {
    return { ok: false, code: "UNAVAILABLE" }
  }

  const local = localBookingTime(
    access.booking.startsAt,
    access.barbershop.timezone,
  )
  if (!local) {
    return { ok: false, code: "UNAVAILABLE" }
  }

  return {
    ok: true,
    booking: {
      serviceName: access.booking.serviceNameSnapshot,
      localDate: local.localDate,
      localTime: local.localTime,
      timezone: access.barbershop.timezone,
      durationMinutes: access.booking.serviceDurationMinutes,
      professionalName: access.booking.staffNameSnapshot,
      customerName: access.booking.customerNameSnapshot,
      status: access.booking.status,
    },
  }
}

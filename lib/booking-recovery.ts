import { createHash, randomBytes } from "node:crypto"
import { z } from "zod"
import { bookingAccessPath, issueBookingAccessToken } from "@/lib/booking-access"
import { sealBookingEmail } from "@/lib/booking-email-crypto"
import { bookingEmailProviderReady } from "@/lib/booking-email"
import { runBookingMutation } from "@/lib/booking-engine"
import { db } from "@/lib/prisma"
import {
  consumeRateLimit, hashRateLimitKey, type RateLimitName,
} from "@/lib/rate-limit"
import { acquireTenantBookingLock } from "@/lib/tenant-booking-lock"
import { barbershopSlugSchema } from "@/lib/validation"

const requestSchema = z.object({
  barbershopSlug: barbershopSlugSchema,
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().min(6).max(32),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
const recoveryTokenPattern = /^[A-Za-z0-9_-]{43}$/
const MAX_AGE_MS = 20 * 60 * 1000
const digits = (phone: string) => phone.replace(/\D/g, "")
const generic = { ok: true as const }

export type BookingRecoveryOptions = {
  sourceIp?: string
  consumeLimit?: (
    name: RateLimitName, key: string,
  ) => Promise<{ allowed: boolean; retryAfterSeconds: number }>
  providerReady?: () => boolean
  now?: () => Date
}

const sha256 = (token: string) =>
  createHash("sha256").update(token, "utf8").digest("hex")

const bookingLocalDate = (date: Date, timezone: string) => {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(date)
    const get = (part: string) => parts.find((p) => p.type === part)?.value
    return [get("year"), get("month"), get("day")].join("-")
  } catch {
    return ""
  }
}

const validLocalDate = (date: string) => {
  const parsed = new Date(date + "T00:00:00.000Z")
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
}

/**
 * Always return the same response for nonexistent email, wrong phone,
 * unknown booking or ambiguous date. A URL is emailed only to the exact
 * existing customer address; nothing is exposed to the caller.
 */
export const requestBookingRecovery = async (
  raw: unknown,
  options: BookingRecoveryOptions = {},
): Promise<{ ok: true } | { ok: false; code: "INVALID_INPUT" | "RATE_LIMITED" | "EMAIL_UNAVAILABLE" }> => {
  const parsed = requestSchema.safeParse(raw)
  if (!parsed.success || !validLocalDate(parsed.data.localDate)) {
    return { ok: false, code: "INVALID_INPUT" }
  }
  if (!(options.providerReady ?? bookingEmailProviderReady)()) {
    return { ok: false, code: "EMAIL_UNAVAILABLE" }
  }

  const sourceIp = options.sourceIp?.trim() || "unknown"
  const consume = options.consumeLimit ?? consumeRateLimit
  const budgets = [
    ["bookingRecoverySource", hashRateLimitKey("booking-recovery-source", sourceIp)],
    ["bookingRecoveryIdentity", hashRateLimitKey(
      "booking-recovery-identity", parsed.data.barbershopSlug, parsed.data.email,
    )],
  ] as const
  for (const [name, key] of budgets) {
    if (!(await consume(name, key)).allowed) {
      return { ok: false, code: "RATE_LIMITED" }
    }
  }

  const tenant = await db.barbershop.findUnique({
    where: { slug: parsed.data.barbershopSlug },
    select: { id: true, name: true, timezone: true, status: true, contactEmail: true },
  })
  if (!tenant || tenant.status !== "ACTIVE" || !tenant.timezone) return generic

  const now = options.now?.() ?? new Date()
  const center = new Date(parsed.data.localDate + "T00:00:00.000Z").getTime()
  const candidates = await db.booking.findMany({
    where: {
      barbershopId: tenant.id,
      customerEmailSnapshot: parsed.data.email,
      status: { in: ["CONFIRMED", "NEEDS_REASSIGNMENT"] },
      startsAt: {
        gt: now,
        gte: new Date(center - 48 * 60 * 60 * 1000),
        lt: new Date(center + 72 * 60 * 60 * 1000),
      },
    },
    select: {
      id: true, customerPhoneSnapshot: true, customerNameSnapshot: true,
      customerEmailSnapshot: true, serviceNameSnapshot: true, startsAt: true,
    },
    take: 26,
  })
  // Fail closed on a high number of matches rather than guess a customer.
  if (candidates.length > 25) return generic
  const matches = candidates.filter((b) =>
    digits(b.customerPhoneSnapshot) === digits(parsed.data.phone) &&
    bookingLocalDate(b.startsAt, tenant.timezone!) === parsed.data.localDate,
  )
  if (matches.length !== 1) return generic
  const booking = matches[0]

  // The existing-link check and insertion must share a tenant-level
  // transaction lock. Otherwise two simultaneous requests could each
  // observe zero active links and enqueue duplicate recovery emails.
  await runBookingMutation(async (tx) => {
    await acquireTenantBookingLock(tx, tenant.id)
    const current = await tx.booking.findUnique({
      where: {
        id_barbershopId: { id: booking.id, barbershopId: tenant.id },
      },
      select: {
        status: true, startsAt: true, customerEmailSnapshot: true,
        customerPhoneSnapshot: true,
      },
    })
    // The appointment may have changed between the initial private
    // lookup and acquisition of the lock. Never email a stale match.
    if (
      !current || current.startsAt <= now ||
      !["CONFIRMED", "NEEDS_REASSIGNMENT"].includes(current.status) ||
      current.customerEmailSnapshot !== parsed.data.email ||
      digits(current.customerPhoneSnapshot) !== digits(parsed.data.phone) ||
      bookingLocalDate(current.startsAt, tenant.timezone!) !== parsed.data.localDate
    ) return

    const existing = await tx.bookingEmailOutbox.count({
      where: {
        barbershopId: tenant.id,
        bookingId: booking.id,
        kind: "RECOVERY",
        recoveryRedeemedAt: null,
        recoveryExpiresAt: { gt: now },
        discardedAt: null,
      },
    })
    if (existing > 0) return

    // 256-bit bearer token; the database stores only its digest.
    const token = randomBytes(32).toString("base64url")
    const sealedPayload = sealBookingEmail({
      kind: "RECOVERY",
      recoveryToken: token,
      email: booking.customerEmailSnapshot!,
      customerName: booking.customerNameSnapshot.slice(0, 120),
      barbershopName: tenant.name.slice(0, 200),
      barbershopContactEmail: tenant.contactEmail ?? undefined,
      serviceName: booking.serviceNameSnapshot.slice(0, 200),
      startsAt: booking.startsAt.toISOString(),
      timezone: tenant.timezone!,
    })
    await tx.bookingEmailOutbox.create({
      data: {
        barbershopId: tenant.id,
        bookingId: booking.id,
        kind: "RECOVERY",
        sealedPayload,
        recoveryTokenHash: sha256(token),
        recoveryExpiresAt: new Date(now.getTime() + MAX_AGE_MS),
      },
    })
  })

  // A worker sends the email independently. Never perform slow external
  // network I/O inside this public endpoint: it would reveal whether the
  // customer exists through response timing, despite the generic body.
  return generic
}

export const redeemBookingRecovery = async (
  rawToken: string,
  options: BookingRecoveryOptions = {},
): Promise<{ ok: true; accessPath: string } | { ok: false; code: "UNAVAILABLE" | "RATE_LIMITED" }> => {
  if (!recoveryTokenPattern.test(rawToken)) return { ok: false, code: "UNAVAILABLE" }

  const sourceIp = options.sourceIp?.trim() || "unknown"
  const consume = options.consumeLimit ?? consumeRateLimit
  const budget = await consume("bookingRecoveryRedeem", hashRateLimitKey("recovery-redeem", sourceIp))
  if (!budget.allowed) return { ok: false, code: "RATE_LIMITED" }

  const tokenHash = sha256(rawToken)
  const identity = await db.bookingEmailOutbox.findUnique({
    where: { recoveryTokenHash: tokenHash },
    select: { id: true, barbershopId: true, bookingId: true },
  })
  if (!identity) return { ok: false, code: "UNAVAILABLE" }

  const now = options.now?.() ?? new Date()
  try {
    const accessPath = await runBookingMutation(async (tx) => {
      await acquireTenantBookingLock(tx, identity.barbershopId)
      const row = await tx.bookingEmailOutbox.findUnique({
        where: { id: identity.id },
        select: {
          kind: true, recoveryTokenHash: true, recoveryExpiresAt: true,
          recoveryRedeemedAt: true, discardedAt: true, acceptedAt: true,
        },
      })
      if (
        !row || row.kind !== "RECOVERY" || row.recoveryTokenHash !== tokenHash ||
        row.discardedAt || !row.acceptedAt || row.recoveryRedeemedAt ||
        !row.recoveryExpiresAt || row.recoveryExpiresAt <= now
      ) return null

      const booking = await tx.booking.findUnique({
        where: {
          id_barbershopId: {
            id: identity.bookingId, barbershopId: identity.barbershopId,
          },
        },
        select: { status: true, startsAt: true },
      })
      if (
        !booking || booking.startsAt <= now ||
        !["CONFIRMED", "NEEDS_REASSIGNMENT"].includes(booking.status)
      ) return null

      // Rotate ONLY when the email holder confirms. All previous URLs
      // continue to work up until this atomic, one-time redemption.
      await tx.bookingAccessToken.updateMany({
        where: {
          bookingId: identity.bookingId,
          barbershopId: identity.barbershopId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      })
      const newCode = await issueBookingAccessToken(tx, {
        bookingId: identity.bookingId,
        barbershopId: identity.barbershopId,
      })
      await tx.bookingEmailOutbox.update({
        where: { id: identity.id },
        data: { recoveryRedeemedAt: now },
      })
      return bookingAccessPath(newCode)
    })
    return accessPath ? { ok: true, accessPath } : { ok: false, code: "UNAVAILABLE" }
  } catch {
    // All effects roll back when token rotation fails.
    return { ok: false, code: "UNAVAILABLE" }
  }
}

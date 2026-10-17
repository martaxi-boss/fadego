import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"
import { z } from "zod"
import { canonicalizeAccessCode } from "@/lib/booking-access"

// Auth secret and mail payload use different HKDF-derived keys; the access
// code remains hashed in BookingAccessToken and encrypted ONLY in the outbox.
const payloadSchema = z.object({
  email: z.string().email().max(254),
  customerName: z.string().min(1).max(120),
  barbershopName: z.string().min(1).max(200),
  serviceName: z.string().min(1).max(200),
  startsAt: z.string().datetime(),
  timezone: z.string().min(1).max(100),
  accessCode: z.string().length(8).optional(),
  recoveryToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
  kind: z.enum(["CONFIRMATION", "RESCHEDULED", "CANCELLED", "RECOVERY"]).optional(),
  previousStartsAt: z.string().datetime().optional(),
})

export type BookingEmailPayload = z.infer<typeof payloadSchema>

const deriveKey = (secret: string | undefined) => {
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("BOOKING_EMAIL_SEAL_SECRET_UNAVAILABLE")
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret, "utf8"),
      Buffer.from("fadego-booking-email"),
      Buffer.from("encrypted-notification-v1"),
      32,
    ),
  )
}

export const sealBookingEmail = (
  raw: BookingEmailPayload,
  secret: string | undefined = process.env.NEXTAUTH_SECRET,
) => {
  const payload = payloadSchema.parse(raw)
  if (payload.kind === "RECOVERY") {
    if (!payload.recoveryToken || payload.accessCode) {
      throw new Error("INVALID_RECOVERY_ACCESS_TOKEN")
    }
  } else if (
    !payload.accessCode || !canonicalizeAccessCode(payload.accessCode) ||
    payload.recoveryToken
  ) {
    throw new Error("INVALID_PRIVATE_ACCESS_CODE")
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return "v1:" + Buffer.concat([iv, tag, encrypted]).toString("base64url")
}

export const openBookingEmail = (
  sealed: string,
  secret: string | undefined = process.env.NEXTAUTH_SECRET,
): BookingEmailPayload => {
  if (!/^v1:[A-Za-z0-9_-]{60,4096}$/.test(sealed)) {
    throw new Error("INVALID_ENCRYPTED_NOTIFICATION")
  }
  const bytes = Buffer.from(sealed.slice(3), "base64url")
  if (bytes.length < 29) {
    throw new Error("INVALID_ENCRYPTED_NOTIFICATION")
  }
  const iv = bytes.subarray(0, 12)
  const tag = bytes.subarray(12, 28)
  const cipherText = bytes.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([
    decipher.update(cipherText),
    decipher.final(),
  ])
  return payloadSchema.parse(JSON.parse(decrypted.toString("utf8")))
}

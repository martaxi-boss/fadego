import { db } from "@/lib/prisma"
import {
  openBookingEmail,
  type BookingEmailPayload,
} from "@/lib/booking-email-crypto"
import { bookingAccessPath } from "@/lib/booking-access"

// Explicitly opt in to one vetted transactional provider. This module cannot
// send emails without the Owner-approved credentials from the VPS vault.
export type BookingEmailTransport = (
  message: { from: string; to: string; subject: string; text: string },
  idempotencyKey: string,
) => Promise<boolean>

type BookingEmailEnvironment = {
  BOOKING_EMAIL_PROVIDER?: string
  BOOKING_EMAIL_FROM?: string
  BOOKING_EMAIL_API_KEY?: string
  NEXTAUTH_SECRET?: string
  NEXTAUTH_URL?: string
}

export const bookingEmailProviderReady = (env: BookingEmailEnvironment = process.env) => {
  const from = env.BOOKING_EMAIL_FROM?.trim() || ""
  const origin = env.NEXTAUTH_URL?.trim() || ""
  const key = env.BOOKING_EMAIL_API_KEY || ""
  if (env.BOOKING_EMAIL_PROVIDER !== "resend" || key.length < 16) return false
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)) return false
  if (!env.NEXTAUTH_SECRET || Buffer.byteLength(env.NEXTAUTH_SECRET) < 32) return false
  try {
    const url = new URL(origin)
    return url.protocol === "https:" && !!url.hostname &&
      !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === "/" && !url.port
  } catch {
    return false
  }
}

const line = (value: string) => value
  .replace(/[\r\n\t\x00-\x1f\x7f]+/g, " ")
  .replace(/\s+/g, " ")
  .trim()

// A fixed snapshot avoids sending a different email body on a network retry.
// If the appointment has changed, the link always shows its CURRENT status.
export const bookingConfirmationMessage = (
  payload: BookingEmailPayload,
  origin: string,
  from: string,
) => {
  const when = new Date(payload.startsAt)
  const humanTime = new Intl.DateTimeFormat("pt-PT", {
    timeZone: payload.timezone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(when)
  const link = new URL(
    bookingAccessPath(payload.accessCode),
    origin,
  ).toString()
  return {
    from,
    to: payload.email,
    subject: "FADEGO — confirmação e acesso privado à tua marcação",
    text: [
      "Olá " + line(payload.customerName) + ",",
      "",
      "A tua marcação foi registada.",
      "Barbearia: " + line(payload.barbershopName),
      "Serviço: " + line(payload.serviceName),
      "Data e hora inicialmente reservadas: " + humanTime,
      "",
      "Consulta a marcação, altera o horário ou cancela através do teu link privado:",
      link,
      "",
      "Código privado: " + payload.accessCode,
      "O link mostra sempre o estado e horário mais recentes.",
      "Não partilhes este link. Não precisas de criar uma conta.",
      "",
      "Se não fizeste esta reserva, contacta diretamente a barbearia.",
      "FADEGO",
    ].join("\n"),
  }
}

export const sendWithResend: BookingEmailTransport = async (mail, id) => {
  if (!bookingEmailProviderReady()) return false
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
      headers: {
        Authorization: "Bearer " + process.env.BOOKING_EMAIL_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": "fadego-confirmation-" + id,
      },
      body: JSON.stringify({
        from: mail.from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
    })
    // Never log response content, email, secrets or private access codes.
    if (response.status !== 200) {
      await response.body?.cancel()
      return false
    }
    const result: unknown = await response.json()
    return !!result && typeof result === "object" &&
      "id" in result && typeof result.id === "string" &&
      result.id.length > 0
  } catch {
    return false
  }
}

const MAX_BATCH = 20

export const deliverBookingEmail = async (
  jobId: string,
  options: { transport?: BookingEmailTransport; now?: () => Date } = {},
): Promise<"accepted" | "pending"> => {
  const transport = options.transport ?? sendWithResend
  if (!options.transport && !bookingEmailProviderReady()) return "pending"

  const now = options.now?.() ?? new Date()
  const lease = new Date(now.getTime() + 90_000)
  const claim = await db.bookingEmailOutbox.updateMany({
    where: {
      id: jobId,
      acceptedAt: null,
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: { leaseUntil: lease, attemptCount: { increment: 1 } },
  })
  if (claim.count !== 1) return "pending"

  const job = await db.bookingEmailOutbox.findUnique({
    where: { id: jobId },
    select: { sealedPayload: true, attemptCount: true },
  })
  if (!job) return "pending"

  let sent = false
  let errorCode = "PROVIDER_UNAVAILABLE"
  try {
    const payload = openBookingEmail(job.sealedPayload)
    const message = bookingConfirmationMessage(
      payload,
      process.env.NEXTAUTH_URL || "https://fadego.duckdns.org",
      process.env.BOOKING_EMAIL_FROM || "not-configured@example.invalid",
    )
    sent = await transport(message, jobId)
    if (!sent) errorCode = "PROVIDER_REFUSED"
  } catch {
    errorCode = "NOTIFICATION_CONFIG_ERROR"
  }

  if (sent) {
    await db.bookingEmailOutbox.updateMany({
      where: { id: jobId, leaseUntil: lease, acceptedAt: null },
      data: {
        acceptedAt: new Date(),
        leaseUntil: null,
        lastErrorCode: null,
        sealedPayload: "", // remove sensitive encrypted content after provider acceptance
      },
    })
    return "accepted"
  }

  // Retry even across process/network failures; cap exponential wait at 1 h.
  const minutes = Math.min(60, 2 ** Math.min(job.attemptCount, 6))
  await db.bookingEmailOutbox.updateMany({
    where: { id: jobId, leaseUntil: lease, acceptedAt: null },
    data: {
      leaseUntil: null,
      lastErrorCode: errorCode,
      nextAttemptAt: new Date(now.getTime() + minutes * 60_000),
    },
  })
  return "pending"
}

export const processPendingBookingEmails = async (
  options: { transport?: BookingEmailTransport; now?: () => Date } = {},
) => {
  if (!options.transport && !bookingEmailProviderReady()) {
    return { accepted: 0, pending: 0, ready: false }
  }
  const now = options.now?.() ?? new Date()
  const jobs = await db.bookingEmailOutbox.findMany({
    where: {
      acceptedAt: null,
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: MAX_BATCH,
    select: { id: true },
  })
  let accepted = 0
  for (const job of jobs) {
    if (await deliverBookingEmail(job.id, options) === "accepted") {
      accepted += 1
    }
  }
  return { accepted, pending: jobs.length - accepted, ready: true }
}

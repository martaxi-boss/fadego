import { createHash } from "node:crypto"
import { db } from "@/lib/prisma"
import {
  openBookingEmail,
  type BookingEmailPayload,
} from "@/lib/booking-email-crypto"
import { bookingAccessPath } from "@/lib/booking-access"

// Explicitly opt in to one vetted transactional provider. This module cannot
// send emails without the Owner-approved credentials from the VPS vault.
export type BookingEmailTransport = (
  message: { from: string; to: string; subject: string; text: string; replyTo?: string },
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

// A verified platform domain can host many tenant-specific From addresses.
// User-controlled mailboxes outside that domain are NEVER used for From
// without a separate authenticated OAuth or domain-ownership integration.
export const resolveTenantSenderAddress = (payload: BookingEmailPayload, platformFrom: string) => {
  const match = /^([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\\.[A-Za-z]{2,})$/.exec(platformFrom)
  if (!match) throw new Error("INVALID_VERIFIED_PLATFORM_SENDER")
  // Backward compatibility for messages queued before tenant aliases existed.
  if (!payload.barbershopSlug) return platformFrom

  const slug = payload.barbershopSlug
  const alias = payload.senderAlias ?? "reservas"
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 63 ||
      !/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(alias)) {
    throw new Error("INVALID_TENANT_SENDER")
  }
  // SMTP local-parts cannot exceed 64 octets. Long names use a stable hash
  // instead of allowing truncation to collide with another tenant's alias.
  const room = 64 - alias.length - 1
  const suffix = slug.length <= room
    ? slug
    : slug.slice(0, room - 17) + "-" + createHash("sha256")
      .update(slug).digest("hex").slice(0, 16)
  return alias + "+" + suffix + "@" + match[2].toLowerCase()
}

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

  // Sender domain remains verified/central; tenant controls only display and reply.
  const senderName = line(payload.barbershopName)
    .replace(/[^A-Za-zÀ-ÿ0-9 .&'-]/g, " ").trim().slice(0, 80) || "FADEGO"
  const brandedFrom = senderName + " <" + resolveTenantSenderAddress(payload, from) + ">"
  const replyTo = payload.barbershopContactEmail
  const kind = payload.kind ?? "CONFIRMATION"
  if (kind === "RECOVERY") {
    if (!payload.recoveryToken) throw new Error("INVALID_RECOVERY_ACCESS_TOKEN")
    const link = new URL("/recuperar/" + payload.recoveryToken, origin).toString()
    return {
      from: brandedFrom,
      ...(replyTo ? { replyTo } : {}),
      to: payload.email,
      subject: "FADEGO — recuperar acesso à tua marcação",
      text: [
        "Olá " + line(payload.customerName) + ",",
        "",
        "Foi pedido um novo acesso à tua marcação.",
        "Barbearia: " + line(payload.barbershopName),
        "Para confirmar e recuperar o acesso, abre este link:",
        link,
        "",
        "O link expira em 20 minutos e só pode ser usado uma vez.",
        "O acesso anterior só é substituído quando confirmas a recuperação.",
        "Se não fizeste este pedido, ignora a mensagem: não foi feita nenhuma alteração.",
        "FADEGO",
      ].join("\n"),
    }
  }
  if (!payload.accessCode) throw new Error("INVALID_PRIVATE_ACCESS_CODE")
  const link = new URL(
    bookingAccessPath(payload.accessCode),
    origin,
  ).toString()
  const previousTime = payload.previousStartsAt
    ? new Intl.DateTimeFormat("pt-PT", {
        timeZone: payload.timezone,
        dateStyle: "full",
        timeStyle: "short",
      }).format(new Date(payload.previousStartsAt))
    : null
  const subject = kind === "RESCHEDULED"
    ? "FADEGO — marcação alterada"
    : kind === "CANCELLED"
      ? "FADEGO — marcação cancelada"
      : "FADEGO — confirmação e acesso privado à tua marcação"
  const actionLines = kind === "RESCHEDULED"
    ? [
        "A tua marcação foi alterada.",
        ...(previousTime ? ["Horário anterior: " + previousTime] : []),
        "Novo horário: " + humanTime,
      ]
    : kind === "CANCELLED"
      ? ["A tua marcação foi cancelada.", "Horário cancelado: " + humanTime]
      : ["A tua marcação foi registada.", "Data e hora inicialmente reservadas: " + humanTime]
  return {
    from: brandedFrom,
    ...(replyTo ? { replyTo } : {}),
    to: payload.email,
    subject,
    text: [
      "Olá " + line(payload.customerName) + ",",
      "",
      ...actionLines,
      "Barbearia: " + line(payload.barbershopName),
      "Serviço: " + line(payload.serviceName),
      "",
      kind === "CANCELLED"
        ? "Consulta o estado da marcação através do teu link privado:"
        : "Consulta a marcação, altera o horário ou cancela através do teu link privado:",
      link,
      "",
      "Código privado: " + payload.accessCode,
      "O link mostra sempre o estado e horário mais recentes.",
      "Não partilhes este link. Não precisas de criar uma conta.",
      "",
      "Se não reconheces esta alteração, contacta diretamente a barbearia.",
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
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
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
      discardedAt: null,
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: { leaseUntil: lease, attemptCount: { increment: 1 } },
  })
  if (claim.count !== 1) return "pending"

  const job = await db.bookingEmailOutbox.findUnique({
    where: { id: jobId },
    select: { sealedPayload: true, attemptCount: true, kind: true, recoveryExpiresAt: true },
  })
  if (!job) return "pending"

  // Expired recovery emails are discarded rather than delivered too late.
  if (job.kind === "RECOVERY" && (!job.recoveryExpiresAt || job.recoveryExpiresAt <= now)) {
    await db.bookingEmailOutbox.updateMany({
      where: { id: jobId, leaseUntil: lease, acceptedAt: null },
      data: {
        discardedAt: now,
        leaseUntil: null,
        lastErrorCode: "RECOVERY_EXPIRED",
        sealedPayload: "",
      },
    })
    return "pending"
  }

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
      discardedAt: null,
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

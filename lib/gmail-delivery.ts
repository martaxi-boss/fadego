import { db } from "@/lib/prisma"
import { barbershopSlugSchema } from "@/lib/validation"
import {
  gmailLiveSendReady, gmailOAuthConfig, openGmailCredential,
  refreshGmailAccessToken, sealGmailCredential, postGmailMessage,
  type GmailEmail,
} from "@/lib/gmail-oauth"

type GmailSendOutcome = "accepted" | "refused" | "uncertain" | "disabled"

// Public bookings MUST fail closed if the specific barbershop has no
// connected, approved Gmail. A ready global OAuth client is not sufficient.
export const gmailTenantReady = async (rawSlug: string) => {
  if (!gmailLiveSendReady()) return false
  const slug = barbershopSlugSchema.safeParse(rawSlug)
  if (!slug.success) return false
  const shop = await db.barbershop.findUnique({
    where: { slug: slug.data },
    select: {
      status: true,
      gmailSenderConnection: { select: { sendingEnabledAt: true } },
    },
  })
  return shop?.status === "ACTIVE" && !!shop.gmailSenderConnection?.sendingEnabledAt
}

export const sendAuthorizedGmailBooking = async (
  job: { barbershopId: string; createdAt: Date },
  makeMessage: (authorizedEmail: string) => GmailEmail,
  beforeSend: () => Promise<boolean>,
): Promise<GmailSendOutcome> => {
  const config = gmailOAuthConfig()
  if (!config || !gmailLiveSendReady()) return "disabled"
  const conn = await db.gmailSenderConnection.findUnique({
    where: { barbershopId: job.barbershopId },
    select: {
      email: true, googleSubject: true, sealedRefreshToken: true,
      sendingEnabledAt: true,
    },
  })
  // Never replay historical or pending bookings from before send consent.
  if (!conn?.sendingEnabledAt || job.createdAt < conn.sendingEnabledAt) return "disabled"

  let accessToken: string
  try {
    const refresh = openGmailCredential(conn.sealedRefreshToken, config, "refresh-token")
    const token = await refreshGmailAccessToken(config, refresh)
    accessToken = token.accessToken
    if (token.rotatedRefreshToken) {
      await db.gmailSenderConnection.updateMany({
        where: {
          barbershopId: job.barbershopId,
          googleSubject: conn.googleSubject,
          sealedRefreshToken: conn.sealedRefreshToken,
        },
        data: {
          sealedRefreshToken: sealGmailCredential(
            token.rotatedRefreshToken, config, "refresh-token",
          ),
        },
      })
    }
  } catch {
    // No send happened yet. Do not reveal tokens or Google errors.
    return "refused"
  }

  // A pause, disconnect or account replacement during the OAuth refresh
  // must prevent this worker from sending as the prior account.
  const stillApproved = await db.gmailSenderConnection.findUnique({
    where: { barbershopId: job.barbershopId },
    select: {
      googleSubject: true, email: true, sendingEnabledAt: true,
    },
  })
  if (!stillApproved?.sendingEnabledAt ||
      stillApproved.googleSubject !== conn.googleSubject ||
      stillApproved.email !== conn.email ||
      stillApproved.sendingEnabledAt.getTime() !== conn.sendingEnabledAt.getTime()) {
    return "disabled"
  }
  // Validate the complete MIME headers before marking the job dispatched.
  const message = makeMessage(conn.email)
  if (!(await beforeSend())) return "uncertain"
  return postGmailMessage(accessToken, conn.email, message)
}

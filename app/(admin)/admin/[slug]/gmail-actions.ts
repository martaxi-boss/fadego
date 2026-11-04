"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { AuthorizationError } from "@/lib/access-policy"
import { requireBarbershopBySlug } from "@/lib/authorization"
import { db } from "@/lib/prisma"
import { consumeRateLimit, hashRateLimitKey } from "@/lib/rate-limit"
import {
  gmailOAuthConfig, gmailLiveSendReady, gmailAuthorizeUrl,
  gmailStateHash, randomGmailChallenge, sealGmailCredential,
} from "@/lib/gmail-oauth"

const contactPath = (slug: string, notice: string) =>
  "/admin/" + slug + "/contact?notice=" + notice

const manager = async (slug: string) => {
  try {
    const access = await requireBarbershopBySlug(slug, ["OWNER", "ADMIN"])
    const budget = await consumeRateLimit(
      "privilegedWrite",
      hashRateLimitKey("gmail-oauth", access.user.id, access.barbershop.id),
    )
    if (!budget.allowed) redirect(contactPath(access.barbershop.slug, "rate-limit"))
    return access
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/admin")
    throw error
  }
}

export async function connectGmailAction(rawSlug: string) {
  const access = await manager(rawSlug)
  const config = gmailOAuthConfig()
  if (!config) redirect(contactPath(access.barbershop.slug, "gmail-unavailable"))
  const oauth = randomGmailChallenge()
  await db.gmailOAuthAttempt.create({
    data: {
      stateHash: gmailStateHash(oauth.state),
      barbershopId: access.barbershop.id,
      userId: access.user.id,
      sealedVerifier: sealGmailCredential(oauth.verifier, config, "verifier"),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  })
  redirect(gmailAuthorizeUrl(config, oauth.state, oauth.challenge))
}

// Google consent only links a sender; it NEVER automatically authorizes sending.
// A separate explicit OWNER/ADMIN confirmation and approved deployment gate are required.
export async function activateGmailAction(rawSlug: string, form: FormData) {
  const access = await manager(rawSlug)
  if (!gmailLiveSendReady()) redirect(contactPath(access.barbershop.slug, "gmail-unavailable"))
  if (form.get("confirmGmailSending") !== "authorize") {
    redirect(contactPath(access.barbershop.slug, "gmail-confirmation-required"))
  }
  const result = await db.gmailSenderConnection.updateMany({
    where: { barbershopId: access.barbershop.id, sendingEnabledAt: null },
    data: { sendingEnabledAt: new Date() },
  })
  if (result.count !== 1) redirect(contactPath(access.barbershop.slug, "gmail-not-connected"))
  revalidatePath("/admin/" + access.barbershop.slug + "/contact")
  redirect(contactPath(access.barbershop.slug, "gmail-activated"))
}

export async function pauseGmailAction(rawSlug: string) {
  const access = await manager(rawSlug)
  await db.gmailSenderConnection.updateMany({
    where: { barbershopId: access.barbershop.id },
    data: { sendingEnabledAt: null },
  })
  revalidatePath("/admin/" + access.barbershop.slug + "/contact")
  redirect(contactPath(access.barbershop.slug, "gmail-paused"))
}

export async function disconnectGmailAction(rawSlug: string) {
  const access = await manager(rawSlug)
  // Remove refresh-token ciphertext (never display/log it). Invalidates the
  // FADEGO connection; the user can separately revoke OAuth in Google settings.
  await db.gmailSenderConnection.deleteMany({ where: { barbershopId: access.barbershop.id } })
  await db.gmailOAuthAttempt.deleteMany({ where: { barbershopId: access.barbershop.id } })
  revalidatePath("/admin/" + access.barbershop.slug + "/contact")
  redirect(contactPath(access.barbershop.slug, "gmail-disconnected"))
}

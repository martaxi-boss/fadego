import { NextResponse } from "next/server"
import { AuthorizationError } from "@/lib/access-policy"
import { requireAuthenticatedActiveUser, requireTenantMembership } from "@/lib/authorization"
import { db } from "@/lib/prisma"
import {
  gmailOAuthConfig, gmailStateHash, exchangeGmailAuthorizationCode,
  fetchGmailIdentity, openGmailCredential, sealGmailCredential,
} from "@/lib/gmail-oauth"

// This public Google callback MUST validate the initiating FADEGO session,
// tenant membership, one-use state, time window and PKCE before token exchange.
export const dynamic = "force-dynamic"

const back = (origin: string, slug: string | null, notice: string) => {
  const target = slug
    ? "/admin/" + slug + "/contact?notice=" + notice
    : "/admin"
  const response = NextResponse.redirect(new URL(target, origin), 303)
  response.headers.set("Cache-Control", "no-store, max-age=0")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}

export async function GET(request: Request) {
  const config = gmailOAuthConfig()
  if (!config) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } })
  const url = new URL(request.url)
  const state = url.searchParams.get("state") || ""
  const code = url.searchParams.get("code") || ""
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return back(config.origin, null, "gmail-invalid")
  const record = await db.gmailOAuthAttempt.findUnique({
    where: { stateHash: gmailStateHash(state) },
    select: {
      stateHash: true, userId: true, barbershopId: true,
      sealedVerifier: true, expiresAt: true, usedAt: true,
      barbershop: { select: { slug: true, status: true } },
    },
  })
  if (!record || record.usedAt || record.expiresAt <= new Date() ||
      record.barbershop.status !== "ACTIVE") {
    return back(config.origin, null, "gmail-invalid")
  }
  try {
    const identity = await requireAuthenticatedActiveUser()
    if (identity.id !== record.userId) return back(config.origin, null, "gmail-invalid")
    await requireTenantMembership(record.barbershopId, ["OWNER", "ADMIN"])
  } catch (error) {
    if (error instanceof AuthorizationError) return back(config.origin, null, "gmail-invalid")
    return back(config.origin, null, "gmail-invalid")
  }
  const shopSlug = record.barbershop.slug
  // A cancelled Google dialog also consumes the attempt. Never reuse a state.
  const consumed = await db.gmailOAuthAttempt.updateMany({
    where: { stateHash: record.stateHash, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  })
  if (consumed.count !== 1) return back(config.origin, shopSlug, "gmail-invalid")
  if (url.searchParams.has("error") || !code || code.length > 4096) {
    return back(config.origin, shopSlug, "gmail-cancelled")
  }
  try {
    const verifier = openGmailCredential(record.sealedVerifier, config, "verifier")
    const tokens = await exchangeGmailAuthorizationCode(config, code, verifier)
    const google = await fetchGmailIdentity(tokens.accessToken)
    // Re-check permissions and state after Google network I/O, so a
    // disconnected/inactivated tenant cannot be re-linked by a late callback.
    const liveAttempt = await db.gmailOAuthAttempt.findUnique({
      where: { stateHash: record.stateHash },
      select: { userId: true, barbershopId: true, usedAt: true },
    })
    const liveRole = await requireTenantMembership(record.barbershopId, ["OWNER", "ADMIN"])
    if (!liveAttempt?.usedAt || liveAttempt.userId !== record.userId ||
        liveAttempt.barbershopId !== record.barbershopId ||
        liveRole.user.id !== record.userId) {
      return back(config.origin, shopSlug, "gmail-invalid")
    }
    const sealed = sealGmailCredential(tokens.refreshToken, config, "refresh-token")
    await db.gmailSenderConnection.upsert({
      where: { barbershopId: record.barbershopId },
      create: {
        barbershopId: record.barbershopId,
        email: google.email,
        googleSubject: google.sub,
        sealedRefreshToken: sealed,
        authorizedByUserId: record.userId,
        sendingEnabledAt: null,
      },
      update: {
        email: google.email, googleSubject: google.sub,
        sealedRefreshToken: sealed, authorizedByUserId: record.userId,
        sendingEnabledAt: null,
      },
    })
    // Authentication and consent alone never trigger an email.
    return back(config.origin, shopSlug, "gmail-connected")
  } catch {
    // No external failure details, raw codes or tokens in logs/redirects.
    return back(config.origin, shopSlug, "gmail-failed")
  }
}

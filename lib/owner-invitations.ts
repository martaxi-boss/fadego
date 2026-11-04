import { createHash, randomBytes } from "node:crypto"
import { auth } from "@/lib/auth"
import { db } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/authorization"
import { platformIdSchema } from "@/lib/platform-account-policy"
import { ownerCanBeInvited, ownerInviteTokenValid } from "@/lib/owner-invitation-policy"
import { hashPassword } from "@/lib/password"
import { consumeRateLimit, hashRateLimitKey } from "@/lib/rate-limit"

const digest = (raw: string) => createHash("sha256").update(raw, "utf8").digest("hex")
export class OwnerInvitationError extends Error {
  constructor(readonly code: "INVALID" | "PASSWORD" | "SIGN_IN" | "RATE_LIMITED") {
    super("Não foi possível concluir o convite do proprietário.")
  }
}

export async function issueOwnerInvitation(shopId: string, memberId: string) {
  const actor = await requireSuperAdmin()
  if (!platformIdSchema.safeParse(shopId).success || !platformIdSchema.safeParse(memberId).success) {
    throw new OwnerInvitationError("INVALID")
  }
  const rate = await consumeRateLimit("privilegedWrite", hashRateLimitKey("owner-invite", actor.id))
  if (!rate.allowed) throw new OwnerInvitationError("RATE_LIMITED")
  const token = randomBytes(32).toString("base64url")
  await db.$transaction(async (tx) => {
    // Same shop row lock as the existing platform status/access mutations.
    const shop = await tx.barbershop.update({ where: { id: shopId }, data: { updatedAt: new Date() } })
    if (shop.status === "ARCHIVED") throw new OwnerInvitationError("INVALID")
    const member = await tx.barbershopMember.findFirst({
      where: { id: memberId, barbershopId: shopId }, include: { user: true },
    })
    if (!ownerCanBeInvited(member) || !member) throw new OwnerInvitationError("INVALID")
    await tx.ownerInvitation.updateMany({
      where: { barbershopId: shopId, membershipId: memberId, redeemedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    await tx.ownerInvitation.create({ data: {
      barbershopId: shopId, membershipId: memberId, email: member.user.email,
      tokenHash: digest(token), expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    } })
  })
  return new URL("/aceitar-negocio/" + token, process.env.NEXTAUTH_URL ?? "https://fadego.duckdns.org").toString()
}

export async function revokeOwnerInvitation(shopId: string, invitationId: string) {
  const actor = await requireSuperAdmin()
  if (!platformIdSchema.safeParse(shopId).success || !platformIdSchema.safeParse(invitationId).success) {
    throw new OwnerInvitationError("INVALID")
  }
  const rate = await consumeRateLimit("privilegedWrite", hashRateLimitKey("owner-invite", actor.id))
  if (!rate.allowed) throw new OwnerInvitationError("RATE_LIMITED")
  await db.$transaction(async (tx) => {
    await tx.barbershop.update({ where: { id: shopId }, data: { updatedAt: new Date() } })
    await tx.ownerInvitation.updateMany({
      where: { id: invitationId, barbershopId: shopId, redeemedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  })
}

export async function lookupOwnerInvitation(token: string) {
  if (!ownerInviteTokenValid(token)) return null
  const invitation = await db.ownerInvitation.findUnique({
    where: { tokenHash: digest(token) },
    include: { membership: { include: { user: true, barbershop: true } } },
  })
  if (!invitation || invitation.redeemedAt || invitation.revokedAt || invitation.expiresAt <= new Date() ||
      invitation.membership.barbershop.status === "ARCHIVED" ||
      !ownerCanBeInvited(invitation.membership) || invitation.membership.user.email !== invitation.email) return null
  return invitation
}

export async function redeemOwnerInvitation(token: string, password: string, confirmation: string) {
  if (!ownerInviteTokenValid(token)) throw new OwnerInvitationError("INVALID")
  const rate = await consumeRateLimit("bookingRecoveryRedeem", hashRateLimitKey("owner-invite-redeem", digest(token)))
  if (!rate.allowed) throw new OwnerInvitationError("RATE_LIMITED")
  const invitation = await lookupOwnerInvitation(token)
  if (!invitation) throw new OwnerInvitationError("INVALID")
  const session = await auth()
  const user = invitation.membership.user
  const isNew = !user.active && user.onboardingPending
  let passwordHash: string | null = null
  if (isNew) {
    // A logged-in different identity must never claim another person's invitation.
    if (session?.user?.id) throw new OwnerInvitationError("SIGN_IN")
    if (password.length < 12 || password.length > 512 || password !== confirmation) {
      throw new OwnerInvitationError("PASSWORD")
    }
    passwordHash = await hashPassword(password)
  } else if (session?.user?.id !== user.id) {
    throw new OwnerInvitationError("SIGN_IN")
  }
  await db.$transaction(async (tx) => {
    const shop = await tx.barbershop.update({
      where: { id: invitation.barbershopId }, data: { updatedAt: new Date() },
    })
    if (shop.status === "ARCHIVED") throw new OwnerInvitationError("INVALID")
    const claimed = await tx.ownerInvitation.updateMany({ where: {
      id: invitation.id, barbershopId: invitation.barbershopId,
      membershipId: invitation.membershipId, redeemedAt: null, revokedAt: null,
      expiresAt: { gt: new Date() },
    }, data: { redeemedAt: new Date() } })
    if (claimed.count !== 1) throw new OwnerInvitationError("INVALID")
    const live = await tx.barbershopMember.findFirst({
      where: { id: invitation.membershipId, barbershopId: invitation.barbershopId }, include: { user: true },
    })
    if (!live || !ownerCanBeInvited(live) || live.userId !== user.id || live.user.email !== invitation.email ||
      live.user.active !== user.active || live.user.onboardingPending !== user.onboardingPending) {
      throw new OwnerInvitationError("INVALID")
    }
    if (isNew && passwordHash) {
      const activated = await tx.user.updateMany({ where: {
        id: user.id, email: invitation.email, active: false, onboardingPending: true, platformRole: "USER",
      }, data: { passwordHash, active: true, onboardingPending: false } })
      if (activated.count !== 1) throw new OwnerInvitationError("INVALID")
    }
    const activated = await tx.barbershopMember.updateMany({ where: {
      id: invitation.membershipId, barbershopId: invitation.barbershopId,
      userId: user.id, role: "OWNER", active: false, revokedAt: null,
    }, data: { active: true } })
    if (activated.count !== 1) throw new OwnerInvitationError("INVALID")
    // Shop remains SUSPENDED; Gmail and public reservations are separate gates.
  })
}

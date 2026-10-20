import { createHash, randomBytes } from "node:crypto"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/prisma"
import { hashPassword } from "@/lib/password"
import { adminEmailSchema } from "@/lib/validation"
import { requireBarbershopBySlug } from "@/lib/authorization"
import { resourceIdSchema } from "@/lib/operational-validation"
import { consumeRateLimit, hashRateLimitKey } from "@/lib/rate-limit"

const invitationEmail = adminEmailSchema
const tokenPattern = /^[A-Za-z0-9_-]{43}$/
const tokenHash = (raw: string) => createHash("sha256").update(raw, "utf8").digest("hex")
const staffPassword = z.string().min(12).max(512)
const TTL = 48 * 60 * 60 * 1000

export class StaffInvitationError extends Error {
  constructor(readonly code:
    | "INVALID" | "RATE_LIMITED" | "PROFILE_UNAVAILABLE" | "ACCOUNT_CONFLICT"
    | "EXPIRED" | "PASSWORD" | "SIGN_IN_REQUIRED") {
    super("Este convite não pode ser concluído.")
  }
}

export const issueStaffInvitation = async (
  slug: string, professionalId: string, rawEmail: string,
) => {
  const access = await requireBarbershopBySlug(slug, ["OWNER", "ADMIN"])
  const email = invitationEmail.safeParse(rawEmail)
  const staffId = resourceIdSchema.safeParse(professionalId)
  if (!email.success || !staffId.success) throw new StaffInvitationError("INVALID")
  const limit = await consumeRateLimit(
    "privilegedWrite",
    hashRateLimitKey("staff-invite", access.user.id, access.barbershop.id),
  )
  if (!limit.allowed) throw new StaffInvitationError("RATE_LIMITED")
  const secret = randomBytes(32).toString("base64url")
  const hash = tokenHash(secret)
  const now = new Date()
  await db.$transaction(async (tx) => {
    const staff = await tx.staffMember.findUnique({
      where: { id_barbershopId: { id: staffId.data, barbershopId: access.barbershop.id } },
      select: { active: true, archivedAt: true, userId: true },
    })
    if (!staff?.active || staff.archivedAt || staff.userId) {
      throw new StaffInvitationError("PROFILE_UNAVAILABLE")
    }
    const user = await tx.user.findUnique({
      where: { email: email.data },
      select: { platformRole: true, active: true },
    })
    if (user && (!user.active || user.platformRole !== "USER")) {
      throw new StaffInvitationError("ACCOUNT_CONFLICT")
    }
    await tx.staffInvitation.updateMany({
      where: {
        barbershopId: access.barbershop.id, staffMemberId: staffId.data,
        redeemedAt: null, revokedAt: null,
      },
      data: { revokedAt: now },
    })
    await tx.staffInvitation.create({
      data: {
        barbershopId: access.barbershop.id, staffMemberId: staffId.data,
        email: email.data, tokenHash: hash,
        expiresAt: new Date(now.getTime() + TTL),
      },
    })
  })
  // Return the bearer only once to the authenticated manager, never log it.
  return new URL("/aceitar-equipa/" + secret,
    process.env.NEXTAUTH_URL ?? "https://fadego.duckdns.org").toString()
}

export const revokeStaffInvitation = async (slug: string, invitationId: string) => {
  const access = await requireBarbershopBySlug(slug, ["OWNER", "ADMIN"])
  const id = resourceIdSchema.safeParse(invitationId)
  if (!id.success) throw new StaffInvitationError("INVALID")
  await db.staffInvitation.updateMany({
    where: { id: id.data, barbershopId: access.barbershop.id, redeemedAt: null,
      revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export const lookupStaffInvitation = async (rawToken: string) => {
  if (!tokenPattern.test(rawToken)) return null
  const invite = await db.staffInvitation.findUnique({
    where: { tokenHash: tokenHash(rawToken) },
    select: {
      id: true, email: true, expiresAt: true, redeemedAt: true, revokedAt: true,
      barbershopId: true, staffMemberId: true,
      barbershop: { select: { name: true, status: true } },
      staffMember: { select: { name: true, active: true, archivedAt: true, userId: true } },
    },
  })
  if (!invite || invite.redeemedAt || invite.revokedAt ||
      invite.expiresAt <= new Date() || invite.barbershop.status === "ARCHIVED" ||
      !invite.staffMember.active || invite.staffMember.archivedAt ||
      invite.staffMember.userId) return null
  return invite
}

export const redeemStaffInvitation = async (
  rawToken: string, rawPassword: string, rawConfirmation: string,
) => {
  const invitation = await lookupStaffInvitation(rawToken)
  if (!invitation) throw new StaffInvitationError("EXPIRED")
  const session = await auth()
  const currentUserId = session?.user?.id ?? null
  const existingUser = await db.user.findUnique({
    where: { email: invitation.email },
    select: { id: true, active: true, platformRole: true },
  })

  let passwordHash: string | null = null
  if (!existingUser) {
    if (currentUserId) throw new StaffInvitationError("SIGN_IN_REQUIRED")
    const parsed = staffPassword.safeParse(rawPassword)
    if (!parsed.success || parsed.data !== rawConfirmation) {
      throw new StaffInvitationError("PASSWORD")
    }
    passwordHash = await hashPassword(parsed.data)
  } else if (!existingUser.active || existingUser.platformRole !== "USER" ||
             existingUser.id !== currentUserId) {
    throw new StaffInvitationError("SIGN_IN_REQUIRED")
  }

  await db.$transaction(async (tx) => {
    // Claim must be atomic and singular even with concurrent POSTs.
    const claimed = await tx.staffInvitation.updateMany({
      where: {
        id: invitation.id, redeemedAt: null, revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { redeemedAt: new Date() },
    })
    if (claimed.count !== 1) throw new StaffInvitationError("EXPIRED")
    const staff = await tx.staffMember.findUnique({
      where: {
        id_barbershopId: { id: invitation.staffMemberId, barbershopId: invitation.barbershopId },
      },
      select: { active: true, archivedAt: true, userId: true, name: true },
    })
    if (!staff?.active || staff.archivedAt || staff.userId) {
      throw new StaffInvitationError("PROFILE_UNAVAILABLE")
    }
    let userId: string
    if (existingUser) {
      const live = await tx.user.findUnique({
        where: { id: existingUser.id },
        select: { active: true, platformRole: true, email: true },
      })
      if (!live?.active || live.platformRole !== "USER" ||
          live.email !== invitation.email) throw new StaffInvitationError("ACCOUNT_CONFLICT")
      userId = existingUser.id
    } else {
      if (!passwordHash) throw new StaffInvitationError("PASSWORD")
      const created = await tx.user.create({
        data: {
          name: staff.name, email: invitation.email, passwordHash,
          platformRole: "USER", active: true,
        },
        select: { id: true },
      })
      userId = created.id
    }
    const membership = await tx.barbershopMember.findUnique({
      where: { barbershopId_userId: {
        barbershopId: invitation.barbershopId, userId,
      } },
      select: { role: true, active: true, revokedAt: true },
    })
    if (membership && (membership.role !== "STAFF" ||
        !membership.active || membership.revokedAt)) {
      throw new StaffInvitationError("ACCOUNT_CONFLICT")
    }
    if (!membership) {
      await tx.barbershopMember.create({
        data: {
          barbershopId: invitation.barbershopId, userId, role: "STAFF",
          active: true,
        },
      })
    }
    // Composite unique constraints forbid cross-tenant links and duplicates.
    await tx.staffMember.update({
      where: { id_barbershopId: {
        id: invitation.staffMemberId, barbershopId: invitation.barbershopId,
      } },
      data: { userId },
    })
  })
}

export const inviteTokenShapeValid = (value: string) => tokenPattern.test(value)

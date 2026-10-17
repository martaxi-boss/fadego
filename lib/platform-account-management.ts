import { randomBytes } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { db } from "@/lib/prisma"
import { hashPassword } from "@/lib/password"
import type {
  CreatePlatformShopInput, EditPlatformShopInput, LinkPlatformMemberInput,
} from "@/lib/platform-account-policy"
import { canActivatePlatformShop } from "@/lib/platform-account-policy"

export type PlatformAccountFailure =
  | "NOT_FOUND" | "ARCHIVED" | "NOT_READY" | "ALREADY_MEMBER"
  | "IDENTITY_NOT_READY" | "LAST_OWNER"

export class PlatformAccountError extends Error {
  constructor(readonly code: PlatformAccountFailure) {
    super(code)
    this.name = "PlatformAccountError"
  }
}

// Onboarding never creates a usable credential: the unknown random password
// is hashed before storage, and the new identity is disabled. Existing users
// are never silently given membership rights either.
export async function createPlatformShop(input: CreatePlatformShopInput) {
  const unusablePasswordHash = await hashPassword(randomBytes(48).toString("hex"))
  return db.$transaction(async (tx) => {
    const previous = await tx.user.findUnique({
      where: { email: input.ownerEmail }, select: { id: true },
    })
    const owner = previous ?? await tx.user.create({
      data: {
        email: input.ownerEmail, passwordHash: unusablePasswordHash,
        active: false, platformRole: "USER",
      },
      select: { id: true },
    })
    const shop = await tx.barbershop.create({
      data: {
        name: input.name, slug: input.slug, contactEmail: input.contactEmail,
        timezone: "Europe/Lisbon", status: "SUSPENDED",
      },
    })
    await tx.barbershopMember.create({
      data: {
        barbershopId: shop.id, userId: owner.id,
        role: "OWNER", active: false,
      },
    })
    return shop
  })
}

async function lockMutableShop(tx: Prisma.TransactionClient, shopId: string) {
  const existing = await tx.barbershop.findUnique({
    where: { id: shopId }, select: { status: true },
  })
  if (!existing) throw new PlatformAccountError("NOT_FOUND")
  if (existing.status === "ARCHIVED") throw new PlatformAccountError("ARCHIVED")
  // PostgreSQL row lock, shared by status/membership changes in this service.
  // A failed transaction rolls back updatedAt too.
  await tx.barbershop.update({
    where: { id: shopId }, data: { updatedAt: new Date() },
  })
  return existing
}

export async function editPlatformShop(shopId: string, input: EditPlatformShopInput) {
  return db.$transaction(async (tx) => {
    await lockMutableShop(tx, shopId)
    return tx.barbershop.update({
      where: { id: shopId },
      data: { name: input.name, contactEmail: input.contactEmail },
    })
  })
}

export async function setPlatformShopStatus(shopId: string, next: "ACTIVE" | "SUSPENDED") {
  return db.$transaction(async (tx) => {
    await lockMutableShop(tx, shopId)
    if (next === "ACTIVE") {
      const [owners, chairs, services, hours] = await Promise.all([
        tx.barbershopMember.count({
          where: {
            barbershopId: shopId, role: "OWNER", active: true,
            revokedAt: null, user: { active: true },
          },
        }),
        tx.chair.count({ where: { barbershopId: shopId, active: true } }),
        tx.service.count({ where: { barbershopId: shopId, active: true } }),
        tx.openingHour.count({
          where: {
            barbershopId: shopId, isClosed: false,
            opensAt: { not: null }, closesAt: { not: null },
          },
        }),
      ])
      if (!canActivatePlatformShop(owners, chairs, services, hours)) {
        throw new PlatformAccountError("NOT_READY")
      }
    }
    return tx.barbershop.update({
      where: { id: shopId }, data: { status: next },
    })
  })
}

export async function linkPlatformMember(shopId: string, input: LinkPlatformMemberInput) {
  return db.$transaction(async (tx) => {
    await lockMutableShop(tx, shopId)
    const user = await tx.user.findUnique({
      where: { email: input.email }, select: { id: true, active: true },
    })
    if (!user?.active) throw new PlatformAccountError("IDENTITY_NOT_READY")
    const existing = await tx.barbershopMember.findUnique({
      where: {
        barbershopId_userId: { barbershopId: shopId, userId: user.id },
      },
    })
    if (existing) throw new PlatformAccountError("ALREADY_MEMBER")
    return tx.barbershopMember.create({
      data: {
        barbershopId: shopId, userId: user.id, role: input.role, active: true,
      },
    })
  })
}

export async function setPlatformMemberAccess(
  shopId: string, membershipId: string, active: boolean,
) {
  return db.$transaction(async (tx) => {
    const shop = await lockMutableShop(tx, shopId)
    const membership = await tx.barbershopMember.findFirst({
      where: { id: membershipId, barbershopId: shopId },
      select: {
        id: true, role: true, active: true, revokedAt: true,
        user: { select: { active: true } },
      },
    })
    if (!membership) throw new PlatformAccountError("NOT_FOUND")
    if (active && (!membership.user.active || membership.revokedAt !== null)) {
      throw new PlatformAccountError("IDENTITY_NOT_READY")
    }
    if (!active && membership.active && membership.role === "OWNER"
        && shop.status === "ACTIVE") {
      const remaining = await tx.barbershopMember.count({
        where: {
          barbershopId: shopId, id: { not: membership.id },
          role: "OWNER", active: true, revokedAt: null, user: { active: true },
        },
      })
      if (remaining === 0) throw new PlatformAccountError("LAST_OWNER")
    }
    return tx.barbershopMember.update({
      where: { id: membership.id }, data: { active },
    })
  })
}

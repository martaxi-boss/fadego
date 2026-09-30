import {
  AuthorizationError,
  requireActiveIdentity,
  requireSuperAdminIdentity,
  requireTenantMembershipIdentity,
  type AccessRepository,
  type TenantRoleValue,
} from "@/lib/access-policy"
import { auth } from "@/lib/auth"
import { db } from "@/lib/prisma"
import { barbershopSlugSchema } from "@/lib/validation"

const accessRepository: AccessRepository = {
  async findUserById(userId) {
    return db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        platformRole: true,
        active: true,
      },
    })
  },
  async findMembership(userId, barbershopId) {
    return db.barbershopMember.findUnique({
      where: {
        barbershopId_userId: {
          barbershopId,
          userId,
        },
      },
      select: {
        id: true,
        barbershopId: true,
        userId: true,
        role: true,
        active: true,
        revokedAt: true,
      },
    })
  },
}

const sessionUserId = async () => {
  const session = await auth()
  return session?.user?.id ?? null
}

export const requireAuthenticatedActiveUser = async () =>
  requireActiveIdentity(await sessionUserId(), accessRepository)

export const requireSuperAdmin = async () =>
  requireSuperAdminIdentity(await sessionUserId(), accessRepository)

export const requireTenantMembership = async (
  barbershopId: string,
  allowedRoles?: readonly TenantRoleValue[],
) =>
  requireTenantMembershipIdentity(
    await sessionUserId(),
    barbershopId,
    accessRepository,
    allowedRoles,
  )

export const requireBarbershopBySlug = async (
  rawSlug: string,
  allowedRoles?: readonly TenantRoleValue[],
) => {
  const parsed = barbershopSlugSchema.safeParse(rawSlug)
  if (!parsed.success) {
    throw new AuthorizationError("FORBIDDEN")
  }

  const barbershop = await db.barbershop.findUnique({
    where: { slug: parsed.data },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
    },
  })

  if (!barbershop) {
    throw new AuthorizationError("FORBIDDEN")
  }

  const access = await requireTenantMembership(barbershop.id, allowedRoles)
  return { barbershop, ...access }
}

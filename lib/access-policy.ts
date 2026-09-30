export type PlatformRoleValue = "USER" | "SUPER_ADMIN"
export type TenantRoleValue = "OWNER" | "ADMIN" | "STAFF"

export interface AccessUser {
  id: string
  name: string | null
  email: string
  platformRole: PlatformRoleValue
  active: boolean
}

export interface AccessMembership {
  id: string
  barbershopId: string
  userId: string
  role: TenantRoleValue
  active: boolean
  revokedAt: Date | null
}

export interface AccessRepository {
  findUserById(userId: string): Promise<AccessUser | null>
  findMembership(
    userId: string,
    barbershopId: string,
  ): Promise<AccessMembership | null>
}

export type AuthorizationCode = "UNAUTHENTICATED" | "FORBIDDEN"

export class AuthorizationError extends Error {
  constructor(public readonly code: AuthorizationCode) {
    super(code === "UNAUTHENTICATED" ? "Authentication required." : "Access denied.")
    this.name = "AuthorizationError"
  }
}

export const requireActiveIdentity = async (
  userId: string | null | undefined,
  repository: AccessRepository,
) => {
  if (!userId) {
    throw new AuthorizationError("UNAUTHENTICATED")
  }

  const user = await repository.findUserById(userId)
  if (!user?.active) {
    throw new AuthorizationError("FORBIDDEN")
  }

  return user
}

export const requireSuperAdminIdentity = async (
  userId: string | null | undefined,
  repository: AccessRepository,
) => {
  const user = await requireActiveIdentity(userId, repository)
  if (user.platformRole !== "SUPER_ADMIN") {
    throw new AuthorizationError("FORBIDDEN")
  }

  return user
}

export const requireTenantMembershipIdentity = async (
  userId: string | null | undefined,
  barbershopId: string,
  repository: AccessRepository,
  allowedRoles?: readonly TenantRoleValue[],
) => {
  const user = await requireActiveIdentity(userId, repository)
  const membership = await repository.findMembership(user.id, barbershopId)

  if (!membership?.active || membership.revokedAt) {
    throw new AuthorizationError("FORBIDDEN")
  }

  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new AuthorizationError("FORBIDDEN")
  }

  return { user, membership }
}

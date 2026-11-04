export type TenantStaffPanelRole = "OWNER" | "ADMIN" | "STAFF"

export type StaffPanelTarget =
  | { mode: "own"; userId: string }
  | { mode: "preview"; professionalId: string }
  | { mode: "choose" }

// A STAFF user cannot choose/guess another professional using a query string.
// A manager can preview only a valid id that the server later scopes to its tenant.
export const resolveStaffPanelTarget = (
  role: TenantStaffPanelRole,
  userId: string,
  requestedProfessional: unknown,
): StaffPanelTarget => {
  if (role === "STAFF") return { mode: "own", userId }
  if (typeof requestedProfessional !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedProfessional)) {
    return { mode: "choose" }
  }
  return { mode: "preview", professionalId: requestedProfessional }
}

export type LinkableStaffIdentity = {
  memberRole: TenantStaffPanelRole
  memberActive: boolean
  revokedAt: Date | null
  userActive: boolean
  platformRole: "USER" | "SUPER_ADMIN"
}

export const isLinkableStaffIdentity = (candidate: LinkableStaffIdentity | null) =>
  candidate !== null &&
  candidate.memberRole === "STAFF" &&
  candidate.memberActive &&
  candidate.revokedAt === null &&
  candidate.userActive &&
  candidate.platformRole === "USER"

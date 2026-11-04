export type OwnerCandidate = {
  role: string
  active: boolean
  revokedAt: Date | null
  user: { active: boolean; platformRole: string; onboardingPending: boolean; email: string }
}

/** Never turn an invitation into account recovery or restoration of revoked access. */
export const ownerCanBeInvited = (member: OwnerCandidate | null) => !!member &&
  member.role === "OWNER" && !member.active && member.revokedAt === null &&
  member.user.platformRole === "USER" &&
  (member.user.active || member.user.onboardingPending)

export const ownerInviteTokenValid = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token)

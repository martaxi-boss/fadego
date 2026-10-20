import { db } from "@/lib/prisma"
import { isLinkableStaffIdentity } from "@/lib/staff-panel-policy"

export class StaffAccountLinkError extends Error {
  constructor(readonly code: "PROFILE_NOT_READY" | "ACCOUNT_NOT_READY" | "ALREADY_LINKED") {
    super("A conta do profissional não pode ser associada.")
  }
}

// Link only an EXISTING active STAFF user of this exact business. This does not
// create users, set passwords, invite accounts or change membership privileges.
export const linkStaffAccount = async (
  barbershopId: string, staffMemberId: string, userId: string | null,
) => db.$transaction(async (tx) => {
  const profile = await tx.staffMember.findUnique({
    where: { id_barbershopId: { id: staffMemberId, barbershopId } },
    select: { id: true, active: true, archivedAt: true },
  })
  if (!profile?.active || profile.archivedAt) {
    throw new StaffAccountLinkError("PROFILE_NOT_READY")
  }

  if (userId !== null) {
    const member = await tx.barbershopMember.findUnique({
      where: { barbershopId_userId: { barbershopId, userId } },
      select: {
        role: true, active: true, revokedAt: true,
        user: { select: { active: true, platformRole: true } },
      },
    })
    if (!isLinkableStaffIdentity(member ? {
      memberRole: member.role,
      memberActive: member.active,
      revokedAt: member.revokedAt,
      userActive: member.user.active,
      platformRole: member.user.platformRole,
    } : null)) throw new StaffAccountLinkError("ACCOUNT_NOT_READY")

    const duplicate = await tx.staffMember.findFirst({
      where: { barbershopId, userId, id: { not: staffMemberId } },
      select: { id: true },
    })
    if (duplicate) throw new StaffAccountLinkError("ALREADY_LINKED")
  }
  return tx.staffMember.update({
    where: { id_barbershopId: { id: staffMemberId, barbershopId } },
    data: { userId },
  })
})

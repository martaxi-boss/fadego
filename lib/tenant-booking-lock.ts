import type { Prisma } from "@prisma/client"

/**
 * Canonical capacity/configuration lock order:
 * 1) tenant transaction advisory lock
 * 2) Booking row when mutating an existing booking
 * 3) Chair rows in deterministic number/id order
 * 4) StaffMember row when required
 *
 * Keep operational configuration and booking mutations on this order to avoid
 * Booking <-> Staff lifecycle deadlocks across application instances.
 */
export const acquireTenantBookingLock = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
) => {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${barbershopId}, 0))
  `
}

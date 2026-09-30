import type { Prisma } from "@prisma/client"
import { db } from "@/lib/prisma"
import type {
  ChairInput,
  OpeningHourInput,
  ServiceInput,
  StaffCreateInput,
  StaffUpdateInput,
} from "@/lib/operational-validation"

export type OperationalConfigErrorCode =
  | "NOT_FOUND"
  | "INVALID_ASSIGNMENT"
  | "INVALID_LIFECYCLE"
  | "INVALID_CONFIGURATION"

export class OperationalConfigError extends Error {
  constructor(public readonly code: OperationalConfigErrorCode) {
    super("Operational configuration rejected.")
    this.name = "OperationalConfigError"
  }
}

type LockedStaffMember = {
  id: string
  active: boolean
  archivedAt: Date | null
}

type LockedChair = {
  id: string
  mode: "WALK_IN" | "GENERAL_BOOKING" | "STAFF_BOOKING"
  staffMemberId: string | null
}

const lockStaffForAssignment = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  staffMemberId: string,
) => {
  const rows = await tx.$queryRaw<LockedStaffMember[]>\`
    /* fadego:staff-assignment-lock */
    SELECT "id", "active", "archivedAt"
    FROM "StaffMember"
    WHERE "id" = \${staffMemberId}
      AND "barbershopId" = \${barbershopId}
    FOR UPDATE
  \`

  return rows[0] ?? null
}

const lockStaffForLifecycle = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  staffMemberId: string,
) => {
  const rows = await tx.$queryRaw<LockedStaffMember[]>\`
    /* fadego:staff-lifecycle-lock */
    SELECT "id", "active", "archivedAt"
    FROM "StaffMember"
    WHERE "id" = \${staffMemberId}
      AND "barbershopId" = \${barbershopId}
    FOR UPDATE
  \`

  return rows[0] ?? null
}

const lockChairForConfiguration = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  chairId: string,
) => {
  const rows = await tx.$queryRaw<LockedChair[]>\`
    /* fadego:chair-configuration-lock */
    SELECT "id", "mode", "staffMemberId"
    FROM "Chair"
    WHERE "id" = \${chairId}
      AND "barbershopId" = \${barbershopId}
    FOR UPDATE
  \`

  return rows[0] ?? null
}

const requireLockedStaffForNewAssignment = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  staffMemberId: string,
) => {
  const staffMember = await lockStaffForAssignment(
    tx,
    barbershopId,
    staffMemberId,
  )

  if (!staffMember?.active || staffMember.archivedAt) {
    throw new OperationalConfigError("INVALID_ASSIGNMENT")
  }

  return staffMember
}

const validateChairShape = (input: ChairInput) => {
  const hasStaff = input.staffMemberId !== null
  const requiresStaff = input.mode === "STAFF_BOOKING"

  if (hasStaff !== requiresStaff) {
    throw new OperationalConfigError("INVALID_CONFIGURATION")
  }
}

export const createStaffMember = async (
  barbershopId: string,
  input: StaffCreateInput,
) =>
  db.staffMember.create({
    data: {
      barbershopId,
      name: input.name,
      photoUrl: input.photoUrl,
      active: input.active,
    },
  })

export const updateStaffMember = async (
  barbershopId: string,
  id: string,
  input: StaffUpdateInput,
) => {
  if (input.archived && input.active) {
    throw new OperationalConfigError("INVALID_LIFECYCLE")
  }

  return db.$transaction(async (tx) => {
    const current = await lockStaffForLifecycle(tx, barbershopId, id)

    if (!current) {
      throw new OperationalConfigError("NOT_FOUND")
    }

    if (current.archivedAt && input.active) {
      throw new OperationalConfigError("INVALID_LIFECYCLE")
    }

    const archivedAt =
      current.archivedAt ?? (input.archived ? new Date() : null)

    return tx.staffMember.update({
      where: {
        id_barbershopId: {
          id,
          barbershopId,
        },
      },
      data: {
        name: input.name,
        photoUrl: input.photoUrl,
        active: archivedAt ? false : input.active,
        archivedAt,
      },
    })
  })
}

export const createChairConfiguration = async (
  barbershopId: string,
  input: ChairInput,
) => {
  validateChairShape(input)

  const staffMemberId = input.staffMemberId
  if (input.mode !== "STAFF_BOOKING" || !staffMemberId) {
    return db.chair.create({
      data: {
        barbershopId,
        number: input.number,
        name: input.name,
        mode: input.mode,
        staffMemberId,
        active: input.active,
      },
    })
  }

  return db.$transaction(async (tx) => {
    await requireLockedStaffForNewAssignment(tx, barbershopId, staffMemberId)

    return tx.chair.create({
      data: {
        barbershopId,
        number: input.number,
        name: input.name,
        mode: input.mode,
        staffMemberId,
        active: input.active,
      },
    })
  })
}

export const updateChairConfiguration = async (
  barbershopId: string,
  id: string,
  input: ChairInput,
) => {
  validateChairShape(input)

  return db.$transaction(async (tx) => {
    const current = await lockChairForConfiguration(tx, barbershopId, id)

    if (!current) {
      throw new OperationalConfigError("NOT_FOUND")
    }

    if (input.mode === "STAFF_BOOKING" && input.staffMemberId) {
      const preservesExistingAssignment =
        current.mode === "STAFF_BOOKING" &&
        current.staffMemberId === input.staffMemberId

      if (!preservesExistingAssignment) {
        await requireLockedStaffForNewAssignment(
          tx,
          barbershopId,
          input.staffMemberId,
        )
      }
    }

    return tx.chair.update({
      where: {
        id_barbershopId: {
          id,
          barbershopId,
        },
      },
      data: {
        number: input.number,
        name: input.name,
        mode: input.mode,
        staffMemberId: input.staffMemberId,
        active: input.active,
      },
    })
  })
}

export const createServiceConfiguration = async (
  barbershopId: string,
  input: ServiceInput,
) =>
  db.service.create({
    data: {
      barbershopId,
      name: input.name,
      description: input.description,
      price: input.price,
      durationMinutes: input.durationMinutes,
      active: input.active,
    },
  })

export const updateServiceConfiguration = async (
  barbershopId: string,
  id: string,
  input: ServiceInput,
) => {
  const current = await db.service.findUnique({
    where: {
      id_barbershopId: {
        id,
        barbershopId,
      },
    },
    select: { id: true },
  })

  if (!current) {
    throw new OperationalConfigError("NOT_FOUND")
  }

  return db.service.update({
    where: {
      id_barbershopId: {
        id,
        barbershopId,
      },
    },
    data: {
      name: input.name,
      description: input.description,
      price: input.price,
      durationMinutes: input.durationMinutes,
      active: input.active,
    },
  })
}

export const saveOpeningHourConfiguration = async (
  barbershopId: string,
  id: string | null,
  input: OpeningHourInput,
) => {
  if (id) {
    const current = await db.openingHour.findUnique({
      where: {
        id_barbershopId: {
          id,
          barbershopId,
        },
      },
      select: {
        id: true,
        weekday: true,
      },
    })

    if (!current) {
      throw new OperationalConfigError("NOT_FOUND")
    }

    if (current.weekday !== input.weekday) {
      throw new OperationalConfigError("INVALID_CONFIGURATION")
    }

    return db.openingHour.update({
      where: {
        id_barbershopId: {
          id,
          barbershopId,
        },
      },
      data: {
        isClosed: input.isClosed,
        opensAt: input.opensAt,
        closesAt: input.closesAt,
      },
    })
  }

  return db.openingHour.create({
    data: {
      barbershopId,
      weekday: input.weekday,
      isClosed: input.isClosed,
      opensAt: input.opensAt,
      closesAt: input.closesAt,
    },
  })
}

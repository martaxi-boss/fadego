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

const requireStaffForNewAssignment = async (
  barbershopId: string,
  staffMemberId: string,
) => {
  const staffMember = await db.staffMember.findUnique({
    where: {
      id_barbershopId: {
        id: staffMemberId,
        barbershopId,
      },
    },
    select: {
      id: true,
      active: true,
      archivedAt: true,
    },
  })

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
  const current = await db.staffMember.findUnique({
    where: {
      id_barbershopId: {
        id,
        barbershopId,
      },
    },
    select: {
      id: true,
      active: true,
      archivedAt: true,
    },
  })

  if (!current) {
    throw new OperationalConfigError("NOT_FOUND")
  }

  if (input.archived && input.active) {
    throw new OperationalConfigError("INVALID_LIFECYCLE")
  }

  if (current.archivedAt && input.active) {
    throw new OperationalConfigError("INVALID_LIFECYCLE")
  }

  const archivedAt =
    current.archivedAt ?? (input.archived ? new Date() : null)

  return db.staffMember.update({
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
}

export const createChairConfiguration = async (
  barbershopId: string,
  input: ChairInput,
) => {
  validateChairShape(input)

  if (input.mode === "STAFF_BOOKING" && input.staffMemberId) {
    await requireStaffForNewAssignment(barbershopId, input.staffMemberId)
  }

  return db.chair.create({
    data: {
      barbershopId,
      number: input.number,
      name: input.name,
      mode: input.mode,
      staffMemberId: input.staffMemberId,
      active: input.active,
    },
  })
}

export const updateChairConfiguration = async (
  barbershopId: string,
  id: string,
  input: ChairInput,
) => {
  validateChairShape(input)

  const current = await db.chair.findUnique({
    where: {
      id_barbershopId: {
        id,
        barbershopId,
      },
    },
    select: {
      id: true,
      mode: true,
      staffMemberId: true,
    },
  })

  if (!current) {
    throw new OperationalConfigError("NOT_FOUND")
  }

  if (input.mode === "STAFF_BOOKING" && input.staffMemberId) {
    const preservesExistingAssignment =
      current.mode === "STAFF_BOOKING" &&
      current.staffMemberId === input.staffMemberId

    if (!preservesExistingAssignment) {
      await requireStaffForNewAssignment(barbershopId, input.staffMemberId)
    }
  }

  return db.chair.update({
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

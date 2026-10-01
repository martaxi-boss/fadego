import type { Prisma } from "@prisma/client"
import { db } from "@/lib/prisma"
import type {
  MembershipPlanEntitlementInput,
  MembershipPlanInput,
} from "@/lib/club-plan-validation"

export type ClubPlanErrorCode =
  | "NOT_FOUND"
  | "INVALID_ASSIGNMENT"
  | "INVALID_LIFECYCLE"

export class ClubPlanError extends Error {
  constructor(public readonly code: ClubPlanErrorCode) {
    super("Club plan operation rejected.")
    this.name = "ClubPlanError"
  }
}

const validateEntitlements = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
  entitlements: MembershipPlanEntitlementInput[],
  existingServiceIds: Set<string>,
) => {
  const ids = entitlements.map((entitlement) => entitlement.serviceId)
  if (ids.length === 0) return

  const services = await tx.service.findMany({
    where: {
      barbershopId,
      id: { in: ids },
    },
    select: {
      id: true,
      active: true,
    },
  })

  const byId = new Map(services.map((service) => [service.id, service]))

  for (const entitlement of entitlements) {
    const service = byId.get(entitlement.serviceId)
    if (!service) {
      throw new ClubPlanError("INVALID_ASSIGNMENT")
    }

    if (!service.active && !existingServiceIds.has(service.id)) {
      throw new ClubPlanError("INVALID_ASSIGNMENT")
    }
  }
}

const entitlementRows = (
  barbershopId: string,
  membershipPlanId: string,
  entitlements: MembershipPlanEntitlementInput[],
) =>
  entitlements.map((entitlement) => ({
    barbershopId,
    membershipPlanId,
    serviceId: entitlement.serviceId,
    usageLimitPerCycle: entitlement.usageLimitPerCycle,
  }))

export const createMembershipPlan = async (
  barbershopId: string,
  input: MembershipPlanInput,
) =>
  db.$transaction(async (tx) => {
    await validateEntitlements(tx, barbershopId, input.entitlements, new Set())

    const plan = await tx.membershipPlan.create({
      data: {
        barbershopId,
        name: input.name,
        description: input.description,
        price: input.price,
        benefits: input.benefits,
        active: input.active,
      },
    })

    if (input.entitlements.length > 0) {
      await tx.membershipPlanService.createMany({
        data: entitlementRows(
          barbershopId,
          plan.id,
          input.entitlements,
        ),
      })
    }

    return tx.membershipPlan.findUniqueOrThrow({
      where: {
        id_barbershopId: {
          id: plan.id,
          barbershopId,
        },
      },
      include: {
        services: {
          include: {
            service: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    })
  })

export const updateMembershipPlan = async (
  barbershopId: string,
  membershipPlanId: string,
  input: MembershipPlanInput,
) =>
  db.$transaction(async (tx) => {
    const current = await tx.membershipPlan.findUnique({
      where: {
        id_barbershopId: {
          id: membershipPlanId,
          barbershopId,
        },
      },
      select: {
        id: true,
        archivedAt: true,
        services: {
          select: {
            serviceId: true,
          },
        },
      },
    })

    if (!current) {
      throw new ClubPlanError("NOT_FOUND")
    }

    if (current.archivedAt) {
      throw new ClubPlanError("INVALID_LIFECYCLE")
    }

    const existingServiceIds = new Set(
      current.services.map((entitlement) => entitlement.serviceId),
    )
    await validateEntitlements(
      tx,
      barbershopId,
      input.entitlements,
      existingServiceIds,
    )

    await tx.membershipPlan.update({
      where: {
        id_barbershopId: {
          id: membershipPlanId,
          barbershopId,
        },
      },
      data: {
        name: input.name,
        description: input.description,
        price: input.price,
        benefits: input.benefits,
        active: input.active,
      },
    })

    await tx.membershipPlanService.deleteMany({
      where: {
        barbershopId,
        membershipPlanId,
      },
    })

    if (input.entitlements.length > 0) {
      await tx.membershipPlanService.createMany({
        data: entitlementRows(
          barbershopId,
          membershipPlanId,
          input.entitlements,
        ),
      })
    }

    return tx.membershipPlan.findUniqueOrThrow({
      where: {
        id_barbershopId: {
          id: membershipPlanId,
          barbershopId,
        },
      },
      include: {
        services: {
          include: {
            service: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    })
  })

export const archiveMembershipPlan = async (
  barbershopId: string,
  membershipPlanId: string,
) =>
  db.$transaction(async (tx) => {
    const current = await tx.membershipPlan.findUnique({
      where: {
        id_barbershopId: {
          id: membershipPlanId,
          barbershopId,
        },
      },
      select: {
        id: true,
        archivedAt: true,
      },
    })

    if (!current) {
      throw new ClubPlanError("NOT_FOUND")
    }

    if (current.archivedAt) {
      throw new ClubPlanError("INVALID_LIFECYCLE")
    }

    return tx.membershipPlan.update({
      where: {
        id_barbershopId: {
          id: membershipPlanId,
          barbershopId,
        },
      },
      data: {
        active: false,
        archivedAt: new Date(),
      },
      include: {
        services: {
          include: {
            service: true,
          },
        },
      },
    })
  })

export const getMembershipPlans = (barbershopId: string) =>
  db.membershipPlan.findMany({
    where: { barbershopId },
    include: {
      services: {
        include: {
          service: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
    orderBy: [
      { archivedAt: "asc" },
      { active: "desc" },
      { name: "asc" },
      { id: "asc" },
    ],
  })

export const getMembershipPlan = (
  barbershopId: string,
  membershipPlanId: string,
) =>
  db.membershipPlan.findUnique({
    where: {
      id_barbershopId: {
        id: membershipPlanId,
        barbershopId,
      },
    },
    include: {
      services: {
        include: {
          service: true,
        },
      },
    },
  })

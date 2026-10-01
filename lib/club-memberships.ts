import type {
  MembershipStatus,
  Prisma,
} from "@prisma/client"
import {
  addCalendarMonthClamped,
  isInsideHalfOpenCycle,
  systemMembershipClock,
  type MembershipClock,
} from "@/lib/membership-cycle"
import type {
  MembershipCustomerInput,
  MembershipLifecycleTarget,
} from "@/lib/club-membership-validation"
import { db } from "@/lib/prisma"

export type ClubMembershipErrorCode =
  | "NOT_FOUND"
  | "PLAN_UNAVAILABLE"
  | "CUSTOMER_UNAVAILABLE"
  | "INVALID_LIFECYCLE"
  | "ENTITLEMENT_UNAVAILABLE"
  | "USAGE_UNAVAILABLE"
  | "LIMIT_REACHED"
  | "CYCLE_UNAVAILABLE"

export class ClubMembershipError extends Error {
  constructor(public readonly code: ClubMembershipErrorCode) {
    super("Club membership operation rejected.")
    this.name = "ClubMembershipError"
  }
}

type MembershipTx = Prisma.TransactionClient

type PlanSnapshot = {
  id: string
  name: string
  price: Prisma.Decimal
  benefits: string | null
  services: Array<{
    serviceId: string
    usageLimitPerCycle: number | null
    service: {
      name: string
    }
  }>
}

const requireEligiblePlan = async (
  tx: MembershipTx,
  barbershopId: string,
  membershipPlanId: string,
): Promise<PlanSnapshot> => {
  const plan = await tx.membershipPlan.findUnique({
    where: {
      id_barbershopId: {
        id: membershipPlanId,
        barbershopId,
      },
    },
    select: {
      id: true,
      name: true,
      price: true,
      benefits: true,
      active: true,
      archivedAt: true,
      services: {
        select: {
          serviceId: true,
          usageLimitPerCycle: true,
          service: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  })

  if (!plan || !plan.active || plan.archivedAt) {
    throw new ClubMembershipError("PLAN_UNAVAILABLE")
  }

  return plan
}

const createMembershipSnapshot = async (
  tx: MembershipTx,
  barbershopId: string,
  customerId: string,
  plan: PlanSnapshot,
  now: Date,
) => {
  const currentCycleStartsAt = new Date(now.getTime())
  const currentCycleEndsAt = addCalendarMonthClamped(currentCycleStartsAt)

  const membership = await tx.membership.create({
    data: {
      barbershopId,
      customerId,
      membershipPlanId: plan.id,
      status: "ACTIVE",
      startedAt: now,
      currentCycleStartsAt,
      currentCycleEndsAt,
      planNameSnapshot: plan.name,
      planPriceSnapshot: plan.price,
      planBenefitsSnapshot: plan.benefits,
    },
  })

  if (plan.services.length > 0) {
    await tx.membershipEntitlement.createMany({
      data: plan.services.map((entitlement) => ({
        barbershopId,
        membershipId: membership.id,
        serviceId: entitlement.serviceId,
        serviceNameSnapshot: entitlement.service.name,
        usageLimitPerCycle: entitlement.usageLimitPerCycle,
      })),
    })
  }

  return tx.membership.findUniqueOrThrow({
    where: {
      id_barbershopId: {
        id: membership.id,
        barbershopId,
      },
    },
    include: {
      customer: true,
      entitlements: {
        include: {
          service: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      usages: {
        orderBy: {
          usedAt: "asc",
        },
      },
    },
  })
}

export const enrollExistingCustomerMembership = async (
  barbershopId: string,
  customerId: string,
  membershipPlanId: string,
  clock: MembershipClock = systemMembershipClock,
) => {
  const now = clock.now()
  if (Number.isNaN(now.getTime())) {
    throw new ClubMembershipError("CYCLE_UNAVAILABLE")
  }

  return db.$transaction(async (tx) => {
    const [plan, customer] = await Promise.all([
      requireEligiblePlan(tx, barbershopId, membershipPlanId),
      tx.customer.findUnique({
        where: {
          id_barbershopId: {
            id: customerId,
            barbershopId,
          },
        },
        select: {
          id: true,
        },
      }),
    ])

    if (!customer) {
      throw new ClubMembershipError("CUSTOMER_UNAVAILABLE")
    }

    return createMembershipSnapshot(
      tx,
      barbershopId,
      customer.id,
      plan,
      now,
    )
  })
}

export const enrollNewCustomerMembership = async (
  barbershopId: string,
  membershipPlanId: string,
  customer: MembershipCustomerInput,
  clock: MembershipClock = systemMembershipClock,
) => {
  const now = clock.now()
  if (Number.isNaN(now.getTime())) {
    throw new ClubMembershipError("CYCLE_UNAVAILABLE")
  }

  return db.$transaction(async (tx) => {
    const plan = await requireEligiblePlan(
      tx,
      barbershopId,
      membershipPlanId,
    )

    const createdCustomer = await tx.customer.create({
      data: {
        barbershopId,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
      },
    })

    return createMembershipSnapshot(
      tx,
      barbershopId,
      createdCustomer.id,
      plan,
      now,
    )
  })
}

const lockMembership = async (
  tx: MembershipTx,
  barbershopId: string,
  membershipId: string,
) => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Membership"
    WHERE "id" = ${membershipId}
      AND "barbershopId" = ${barbershopId}
    FOR UPDATE
  `

  if (!rows[0]) {
    throw new ClubMembershipError("NOT_FOUND")
  }
}

const allowedTransitions: Readonly<
  Record<MembershipStatus, readonly MembershipStatus[]>
> = {
  ACTIVE: ["PAST_DUE", "CANCELLED", "EXPIRED"],
  PAST_DUE: ["ACTIVE", "CANCELLED", "EXPIRED"],
  CANCELLED: [],
  EXPIRED: [],
}

export const transitionMembershipStatus = async (
  barbershopId: string,
  membershipId: string,
  target: MembershipLifecycleTarget,
  clock: MembershipClock = systemMembershipClock,
) => {
  const now = clock.now()
  if (Number.isNaN(now.getTime())) {
    throw new ClubMembershipError("CYCLE_UNAVAILABLE")
  }

  return db.$transaction(async (tx) => {
    await lockMembership(tx, barbershopId, membershipId)

    const current = await tx.membership.findUnique({
      where: {
        id_barbershopId: {
          id: membershipId,
          barbershopId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    })

    if (!current) {
      throw new ClubMembershipError("NOT_FOUND")
    }

    if (!allowedTransitions[current.status].includes(target)) {
      throw new ClubMembershipError("INVALID_LIFECYCLE")
    }

    const data:
      | {
          status: "ACTIVE" | "PAST_DUE"
        }
      | {
          status: "CANCELLED"
          cancelledAt: Date
        }
      | {
          status: "EXPIRED"
          expiredAt: Date
        } =
      target === "CANCELLED"
        ? { status: "CANCELLED", cancelledAt: now }
        : target === "EXPIRED"
          ? { status: "EXPIRED", expiredAt: now }
          : { status: target }

    return tx.membership.update({
      where: {
        id_barbershopId: {
          id: membershipId,
          barbershopId,
        },
      },
      data,
      include: {
        customer: true,
        entitlements: true,
        usages: true,
      },
    })
  })
}

export const recordMembershipUsage = async (
  barbershopId: string,
  membershipId: string,
  membershipEntitlementId: string,
  clock: MembershipClock = systemMembershipClock,
) => {
  const now = clock.now()
  if (Number.isNaN(now.getTime())) {
    throw new ClubMembershipError("CYCLE_UNAVAILABLE")
  }

  return db.$transaction(async (tx) => {
    await lockMembership(tx, barbershopId, membershipId)

    const membership = await tx.membership.findUnique({
      where: {
        id_barbershopId: {
          id: membershipId,
          barbershopId,
        },
      },
      select: {
        id: true,
        status: true,
        currentCycleStartsAt: true,
        currentCycleEndsAt: true,
      },
    })

    if (!membership) {
      throw new ClubMembershipError("NOT_FOUND")
    }

    if (membership.status !== "ACTIVE") {
      throw new ClubMembershipError("USAGE_UNAVAILABLE")
    }

    if (
      !isInsideHalfOpenCycle(
        now,
        membership.currentCycleStartsAt,
        membership.currentCycleEndsAt,
      )
    ) {
      throw new ClubMembershipError("CYCLE_UNAVAILABLE")
    }

    const entitlement = await tx.membershipEntitlement.findUnique({
      where: {
        id_membershipId_barbershopId: {
          id: membershipEntitlementId,
          membershipId,
          barbershopId,
        },
      },
      select: {
        id: true,
        usageLimitPerCycle: true,
      },
    })

    if (!entitlement) {
      throw new ClubMembershipError("ENTITLEMENT_UNAVAILABLE")
    }

    const usedCount = await tx.membershipUsage.count({
      where: {
        barbershopId,
        membershipId,
        membershipEntitlementId: entitlement.id,
        cycleStartsAtSnapshot: membership.currentCycleStartsAt,
        cycleEndsAtSnapshot: membership.currentCycleEndsAt,
      },
    })

    if (
      entitlement.usageLimitPerCycle !== null &&
      usedCount >= entitlement.usageLimitPerCycle
    ) {
      throw new ClubMembershipError("LIMIT_REACHED")
    }

    const usage = await tx.membershipUsage.create({
      data: {
        barbershopId,
        membershipId,
        membershipEntitlementId: entitlement.id,
        usedAt: now,
        cycleStartsAtSnapshot: membership.currentCycleStartsAt,
        cycleEndsAtSnapshot: membership.currentCycleEndsAt,
      },
    })

    const nextUsedCount = usedCount + 1
    return {
      usage,
      usedCount: nextUsedCount,
      remaining:
        entitlement.usageLimitPerCycle === null
          ? null
          : entitlement.usageLimitPerCycle - nextUsedCount,
      unlimited: entitlement.usageLimitPerCycle === null,
    }
  })
}

export const getMemberships = (barbershopId: string) =>
  db.membership.findMany({
    where: {
      barbershopId,
    },
    include: {
      customer: true,
      entitlements: {
        include: {
          service: true,
          usages: {
            orderBy: {
              usedAt: "asc",
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      usages: {
        orderBy: {
          usedAt: "desc",
        },
      },
    },
    orderBy: [
      { status: "asc" },
      { createdAt: "desc" },
      { id: "asc" },
    ],
  })

export const getMembership = (
  barbershopId: string,
  membershipId: string,
) =>
  db.membership.findUnique({
    where: {
      id_barbershopId: {
        id: membershipId,
        barbershopId,
      },
    },
    include: {
      customer: true,
      entitlements: {
        include: {
          service: true,
          usages: {
            orderBy: {
              usedAt: "asc",
            },
          },
        },
      },
      usages: {
        orderBy: {
          usedAt: "asc",
        },
      },
    },
  })

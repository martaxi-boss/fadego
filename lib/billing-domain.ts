import type {
  PaymentStatus,
  PlatformSubscriptionStatus,
  Prisma,
} from "@prisma/client"
import { db } from "@/lib/prisma"

export type BillingClock = {
  now(): Date
}

export const systemBillingClock: BillingClock = {
  now: () => new Date(),
}

export type BillingDomainErrorCode =
  | "NOT_FOUND"
  | "INVALID_LIFECYCLE"
  | "INVALID_CLOCK"

export class BillingDomainError extends Error {
  constructor(public readonly code: BillingDomainErrorCode) {
    super("Billing domain operation rejected.")
    this.name = "BillingDomainError"
  }
}

type BillingTx = Prisma.TransactionClient

const requireValidNow = (clock: BillingClock) => {
  const now = clock.now()
  if (Number.isNaN(now.getTime())) {
    throw new BillingDomainError("INVALID_CLOCK")
  }
  return now
}

const lockPayment = async (
  tx: BillingTx,
  barbershopId: string,
  paymentId: string,
) => {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT "id" FROM "Payment" WHERE "id" = $1 AND "barbershopId" = $2 FOR UPDATE',
    paymentId,
    barbershopId,
  )

  if (!rows[0]) {
    throw new BillingDomainError("NOT_FOUND")
  }
}

const paymentTransitions: Readonly<
  Record<PaymentStatus, readonly PaymentStatus[]>
> = {
  PENDING: ["SUCCEEDED", "FAILED"],
  SUCCEEDED: ["REFUNDED"],
  FAILED: [],
  REFUNDED: [],
}

export const transitionPaymentStatus = async (
  barbershopId: string,
  paymentId: string,
  target: PaymentStatus,
  clock: BillingClock = systemBillingClock,
) => {
  const now = requireValidNow(clock)

  return db.$transaction(async (tx) => {
    await lockPayment(tx, barbershopId, paymentId)

    const current = await tx.payment.findUnique({
      where: {
        id_barbershopId: {
          id: paymentId,
          barbershopId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    })

    if (!current) {
      throw new BillingDomainError("NOT_FOUND")
    }

    if (!paymentTransitions[current.status].includes(target)) {
      throw new BillingDomainError("INVALID_LIFECYCLE")
    }

    const data:
      | { status: "SUCCEEDED"; paidAt: Date }
      | { status: "FAILED"; failedAt: Date }
      | { status: "REFUNDED"; refundedAt: Date } =
      target === "SUCCEEDED"
        ? { status: "SUCCEEDED", paidAt: now }
        : target === "FAILED"
          ? { status: "FAILED", failedAt: now }
          : { status: "REFUNDED", refundedAt: now }

    return tx.payment.update({
      where: {
        id_barbershopId: {
          id: paymentId,
          barbershopId,
        },
      },
      data,
    })
  })
}

const lockPlatformSubscription = async (
  tx: BillingTx,
  barbershopId: string,
) => {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT "id" FROM "PlatformSubscription" WHERE "barbershopId" = $1 FOR UPDATE',
    barbershopId,
  )

  if (!rows[0]) {
    throw new BillingDomainError("NOT_FOUND")
  }
}

const platformTransitions: Readonly<
  Record<
    PlatformSubscriptionStatus,
    readonly PlatformSubscriptionStatus[]
  >
> = {
  ACTIVE: ["PAST_DUE"],
  PAST_DUE: ["ACTIVE", "SUSPENDED"],
  SUSPENDED: ["ACTIVE"],
}

export const transitionPlatformSubscriptionStatus = async (
  barbershopId: string,
  target: PlatformSubscriptionStatus,
) =>
  db.$transaction(async (tx) => {
    await lockPlatformSubscription(tx, barbershopId)

    const current = await tx.platformSubscription.findUnique({
      where: { barbershopId },
      select: {
        id: true,
        status: true,
      },
    })

    if (!current) {
      throw new BillingDomainError("NOT_FOUND")
    }

    if (!platformTransitions[current.status].includes(target)) {
      throw new BillingDomainError("INVALID_LIFECYCLE")
    }

    return tx.platformSubscription.update({
      where: { barbershopId },
      data: { status: target },
    })
  })

export const getPayment = (
  barbershopId: string,
  paymentId: string,
) =>
  db.payment.findUnique({
    where: {
      id_barbershopId: {
        id: paymentId,
        barbershopId,
      },
    },
  })

export const listMembershipPayments = (
  barbershopId: string,
  membershipId: string,
) =>
  db.payment.findMany({
    where: {
      barbershopId,
      membershipId,
    },
    orderBy: [
      { cycleStartsAtSnapshot: "desc" },
      { createdAt: "desc" },
      { id: "asc" },
    ],
  })

export const getPlatformSubscription = (barbershopId: string) =>
  db.platformSubscription.findUnique({
    where: { barbershopId },
  })

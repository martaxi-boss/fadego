import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { after, test } from "node:test"
import {
  AuthorizationError,
  requireTenantMembershipIdentity,
  type AccessRepository,
} from "../lib/access-policy"
import {
  archiveMembershipPlan,
  createMembershipPlan,
  updateMembershipPlan,
} from "../lib/club-plans"
import {
  ClubMembershipError,
  enrollExistingCustomerMembership,
  enrollNewCustomerMembership,
  getMembership,
  getMemberships,
  recordMembershipUsage,
  transitionMembershipStatus,
} from "../lib/club-memberships"
import {
  membershipCustomerInputSchema,
} from "../lib/club-membership-validation"
import {
  addCalendarMonthClamped,
  type MembershipClock,
} from "../lib/membership-cycle"
import { db, getPool } from "../lib/prisma"

const createdShopIds: string[] = []
const createdUserIds: string[] = []

const fixedInstant = new Date("2030-01-31T10:15:30.000Z")
const fixedClock: MembershipClock = {
  now: () => new Date(fixedInstant.getTime()),
}

const clockAt = (iso: string): MembershipClock => ({
  now: () => new Date(iso),
})

const createShop = async (tag: string) => {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10)
  const shop = await db.barbershop.create({
    data: {
      name: "Membership " + tag,
      slug:
        "membership-" +
        tag.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
        "-" +
        suffix,
      timezone: "UTC",
    },
  })
  createdShopIds.push(shop.id)
  return shop
}

const createCustomer = (
  barbershopId: string,
  tag: string,
  options?: { phone?: string; email?: string | null },
) =>
  db.customer.create({
    data: {
      barbershopId,
      name: "Customer " + tag,
      phone: options?.phone ?? "+351 910 100 200",
      email: options?.email ?? null,
    },
  })

const createService = (
  barbershopId: string,
  name: string,
  active = true,
) =>
  db.service.create({
    data: {
      barbershopId,
      name,
      price: "20.00",
      durationMinutes: 30,
      active,
    },
  })

const createPlan = async (
  barbershopId: string,
  options?: {
    name?: string
    price?: string
    benefits?: string | null
    active?: boolean
    services?: Array<{
      serviceId: string
      usageLimitPerCycle: number | null
    }>
  },
) =>
  createMembershipPlan(barbershopId, {
    name: options?.name ?? "Club Original",
    description: "Plano de teste",
    price: options?.price ?? "39.90",
    benefits: options?.benefits ?? "Benefícios A",
    active: options?.active ?? true,
    entitlements: options?.services ?? [],
  })

const expectMembershipCode = async (
  action: () => Promise<unknown>,
  code:
    | "NOT_FOUND"
    | "PLAN_UNAVAILABLE"
    | "CUSTOMER_UNAVAILABLE"
    | "INVALID_LIFECYCLE"
    | "ENTITLEMENT_UNAVAILABLE"
    | "USAGE_UNAVAILABLE"
    | "LIMIT_REACHED"
    | "CYCLE_UNAVAILABLE",
) => {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof ClubMembershipError)
    assert.equal(error.code, code)
    return true
  })
}

const createIdentity = async (
  barbershopId: string,
  role: "OWNER" | "ADMIN" | "STAFF",
  tag: string,
) => {
  const user = await db.user.create({
    data: {
      name: "Membership " + role,
      email:
        "membership-" + tag + "-" + randomUUID() + "@example.test",
      passwordHash: "test-only-password-hash",
    },
  })
  createdUserIds.push(user.id)
  await db.barbershopMember.create({
    data: {
      barbershopId,
      userId: user.id,
      role,
      active: true,
    },
  })
  return user
}

const accessRepository: AccessRepository = {
  findUserById(userId) {
    return db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        platformRole: true,
        active: true,
      },
    })
  },
  findMembership(userId, barbershopId) {
    return db.barbershopMember.findUnique({
      where: {
        barbershopId_userId: {
          barbershopId,
          userId,
        },
      },
      select: {
        id: true,
        barbershopId: true,
        userId: true,
        role: true,
        active: true,
        revokedAt: true,
      },
    })
  },
}

after(async () => {
  if (createdShopIds.length > 0) {
    await db.membershipUsage.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.membershipEntitlement.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.membership.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.membershipPlanService.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.membershipPlan.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.bookingAccessToken.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.booking.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.customer.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.chair.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.openingHour.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.service.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.staffMember.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.barbershopMember.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.barbershop.deleteMany({
      where: { id: { in: createdShopIds } },
    })
  }

  if (createdUserIds.length > 0) {
    await db.user.deleteMany({
      where: { id: { in: createdUserIds } },
    })
  }

  await db.$disconnect()
  await getPool().end()
})

test("calendar-month helper clamps month-end and preserves UTC time", () => {
  assert.equal(
    addCalendarMonthClamped(
      new Date("2030-01-31T10:15:30.000Z"),
    ).toISOString(),
    "2030-02-28T10:15:30.000Z",
  )
  assert.equal(
    addCalendarMonthClamped(
      new Date("2032-01-31T10:15:30.000Z"),
    ).toISOString(),
    "2032-02-29T10:15:30.000Z",
  )
  assert.equal(
    addCalendarMonthClamped(
      new Date("2030-03-31T10:15:30.000Z"),
    ).toISOString(),
    "2030-04-30T10:15:30.000Z",
  )
})

test("customer validation matches Phase 4 semantics", () => {
  const parsed = membershipCustomerInputSchema.safeParse({
    name: "  Maria Club  ",
    phone: "  +34 600 123 456  ",
    email: "  MARIA@EXAMPLE.TEST  ",
  })
  assert.equal(parsed.success, true)
  if (!parsed.success) return
  assert.equal(parsed.data.name, "Maria Club")
  assert.equal(parsed.data.phone, "+34 600 123 456")
  assert.equal(parsed.data.email, "maria@example.test")
})

test("database rejects invalid Membership cycle range", async () => {
  const shop = await createShop("cycle-db")
  const customer = await createCustomer(shop.id, "cycle")
  const plan = await createPlan(shop.id)

  await assert.rejects(() =>
    db.membership.create({
      data: {
        barbershopId: shop.id,
        customerId: customer.id,
        membershipPlanId: plan.id,
        status: "ACTIVE",
        startedAt: new Date("2030-01-01T00:00:00.000Z"),
        currentCycleStartsAt: new Date("2030-02-01T00:00:00.000Z"),
        currentCycleEndsAt: new Date("2030-02-01T00:00:00.000Z"),
        planNameSnapshot: plan.name,
        planPriceSnapshot: plan.price,
      },
    }),
  )
})

test("database rejects cross-tenant Membership customer and plan relations", async () => {
  const first = await createShop("membership-cross-a")
  const second = await createShop("membership-cross-b")
  const firstCustomer = await createCustomer(first.id, "first")
  const secondCustomer = await createCustomer(second.id, "second")
  const firstPlan = await createPlan(first.id)
  const secondPlan = await createPlan(second.id)
  const starts = new Date("2030-01-01T00:00:00.000Z")
  const ends = new Date("2030-02-01T00:00:00.000Z")

  await assert.rejects(() =>
    db.membership.create({
      data: {
        barbershopId: first.id,
        customerId: secondCustomer.id,
        membershipPlanId: firstPlan.id,
        status: "ACTIVE",
        startedAt: starts,
        currentCycleStartsAt: starts,
        currentCycleEndsAt: ends,
        planNameSnapshot: firstPlan.name,
        planPriceSnapshot: firstPlan.price,
      },
    }),
  )

  await assert.rejects(() =>
    db.membership.create({
      data: {
        barbershopId: first.id,
        customerId: firstCustomer.id,
        membershipPlanId: secondPlan.id,
        status: "ACTIVE",
        startedAt: starts,
        currentCycleStartsAt: starts,
        currentCycleEndsAt: ends,
        planNameSnapshot: secondPlan.name,
        planPriceSnapshot: secondPlan.price,
      },
    }),
  )
})

test("database rejects cross-tenant MembershipEntitlement relations", async () => {
  const first = await createShop("entitlement-cross-a")
  const second = await createShop("entitlement-cross-b")
  const firstService = await createService(first.id, "First service")
  const secondService = await createService(second.id, "Second service")
  const firstCustomer = await createCustomer(first.id, "first")
  const secondCustomer = await createCustomer(second.id, "second")
  const firstPlan = await createPlan(first.id)
  const secondPlan = await createPlan(second.id)
  const firstMembership = await enrollExistingCustomerMembership(
    first.id,
    firstCustomer.id,
    firstPlan.id,
    fixedClock,
  )
  const secondMembership = await enrollExistingCustomerMembership(
    second.id,
    secondCustomer.id,
    secondPlan.id,
    fixedClock,
  )

  await assert.rejects(() =>
    db.membershipEntitlement.create({
      data: {
        barbershopId: first.id,
        membershipId: secondMembership.id,
        serviceId: firstService.id,
        serviceNameSnapshot: firstService.name,
        usageLimitPerCycle: 1,
      },
    }),
  )

  await assert.rejects(() =>
    db.membershipEntitlement.create({
      data: {
        barbershopId: first.id,
        membershipId: firstMembership.id,
        serviceId: secondService.id,
        serviceNameSnapshot: secondService.name,
        usageLimitPerCycle: 1,
      },
    }),
  )
})

test("database rejects duplicate and invalid finite Membership entitlements", async () => {
  const shop = await createShop("entitlement-limits")
  const service = await createService(shop.id, "Finite")
  const customer = await createCustomer(shop.id, "finite")
  const plan = await createPlan(shop.id)
  const membership = await enrollExistingCustomerMembership(
    shop.id,
    customer.id,
    plan.id,
    fixedClock,
  )

  await db.membershipEntitlement.create({
    data: {
      barbershopId: shop.id,
      membershipId: membership.id,
      serviceId: service.id,
      serviceNameSnapshot: service.name,
      usageLimitPerCycle: 2,
    },
  })

  await assert.rejects(() =>
    db.membershipEntitlement.create({
      data: {
        barbershopId: shop.id,
        membershipId: membership.id,
        serviceId: service.id,
        serviceNameSnapshot: service.name,
        usageLimitPerCycle: 3,
      },
    }),
  )

  const other = await createService(shop.id, "Zero")
  await assert.rejects(() =>
    db.membershipEntitlement.create({
      data: {
        barbershopId: shop.id,
        membershipId: membership.id,
        serviceId: other.id,
        serviceNameSnapshot: other.name,
        usageLimitPerCycle: 0,
      },
    }),
  )
})

test("database prevents MembershipUsage entitlement from another Membership", async () => {
  const shop = await createShop("usage-pair")
  const firstService = await createService(shop.id, "A")
  const secondService = await createService(shop.id, "B")
  const plan = await createPlan(shop.id, {
    services: [
      { serviceId: firstService.id, usageLimitPerCycle: 2 },
      { serviceId: secondService.id, usageLimitPerCycle: 2 },
    ],
  })
  const firstCustomer = await createCustomer(shop.id, "A")
  const secondCustomer = await createCustomer(shop.id, "B")
  const first = await enrollExistingCustomerMembership(
    shop.id,
    firstCustomer.id,
    plan.id,
    fixedClock,
  )
  const second = await enrollExistingCustomerMembership(
    shop.id,
    secondCustomer.id,
    plan.id,
    fixedClock,
  )
  const foreignEntitlement = second.entitlements[0]
  assert.ok(foreignEntitlement)

  await assert.rejects(() =>
    db.membershipUsage.create({
      data: {
        barbershopId: shop.id,
        membershipId: first.id,
        membershipEntitlementId: foreignEntitlement.id,
        usedAt: fixedInstant,
        cycleStartsAtSnapshot: first.currentCycleStartsAt,
        cycleEndsAtSnapshot: first.currentCycleEndsAt,
      },
    }),
  )
})

test("database enforces terminal status timestamp shape", async () => {
  const shop = await createShop("terminal-shape")
  const customer = await createCustomer(shop.id, "terminal")
  const plan = await createPlan(shop.id)
  const starts = new Date("2030-01-01T00:00:00.000Z")
  const ends = new Date("2030-02-01T00:00:00.000Z")

  await assert.rejects(() =>
    db.membership.create({
      data: {
        barbershopId: shop.id,
        customerId: customer.id,
        membershipPlanId: plan.id,
        status: "CANCELLED",
        startedAt: starts,
        currentCycleStartsAt: starts,
        currentCycleEndsAt: ends,
        planNameSnapshot: plan.name,
        planPriceSnapshot: plan.price,
      },
    }),
  )

  await assert.rejects(() =>
    db.membership.create({
      data: {
        barbershopId: shop.id,
        customerId: customer.id,
        membershipPlanId: plan.id,
        status: "ACTIVE",
        startedAt: starts,
        currentCycleStartsAt: starts,
        currentCycleEndsAt: ends,
        cancelledAt: starts,
        planNameSnapshot: plan.name,
        planPriceSnapshot: plan.price,
      },
    }),
  )

  await assert.rejects(() =>
    db.membership.create({
      data: {
        barbershopId: shop.id,
        customerId: customer.id,
        membershipPlanId: plan.id,
        status: "EXPIRED",
        startedAt: starts,
        currentCycleStartsAt: starts,
        currentCycleEndsAt: ends,
        planNameSnapshot: plan.name,
        planPriceSnapshot: plan.price,
      },
    }),
  )
})

test("existing same-tenant Customer enrollment captures one calendar month", async () => {
  const shop = await createShop("existing-enroll")
  const customer = await createCustomer(shop.id, "existing")
  const plan = await createPlan(shop.id)

  const membership = await enrollExistingCustomerMembership(
    shop.id,
    customer.id,
    plan.id,
    fixedClock,
  )

  assert.equal(membership.customerId, customer.id)
  assert.equal(membership.status, "ACTIVE")
  assert.equal(
    membership.startedAt.toISOString(),
    "2030-01-31T10:15:30.000Z",
  )
  assert.equal(
    membership.currentCycleStartsAt.toISOString(),
    "2030-01-31T10:15:30.000Z",
  )
  assert.equal(
    membership.currentCycleEndsAt.toISOString(),
    "2030-02-28T10:15:30.000Z",
  )
})

test("foreign Customer enrollment is rejected", async () => {
  const first = await createShop("foreign-customer-a")
  const second = await createShop("foreign-customer-b")
  const foreignCustomer = await createCustomer(second.id, "foreign")
  const plan = await createPlan(first.id)

  await expectMembershipCode(
    () =>
      enrollExistingCustomerMembership(
        first.id,
        foreignCustomer.id,
        plan.id,
        fixedClock,
      ),
    "CUSTOMER_UNAVAILABLE",
  )
})

test("inactive and archived plans reject new enrollment without rewriting existing memberships", async () => {
  const shop = await createShop("plan-eligibility")
  const customer = await createCustomer(shop.id, "first")
  const plan = await createPlan(shop.id)
  const existing = await enrollExistingCustomerMembership(
    shop.id,
    customer.id,
    plan.id,
    fixedClock,
  )

  await updateMembershipPlan(shop.id, plan.id, {
    name: plan.name,
    description: plan.description,
    price: plan.price.toFixed(2),
    benefits: plan.benefits,
    active: false,
    entitlements: [],
  })

  const nextCustomer = await createCustomer(shop.id, "second")
  await expectMembershipCode(
    () =>
      enrollExistingCustomerMembership(
        shop.id,
        nextCustomer.id,
        plan.id,
        fixedClock,
      ),
    "PLAN_UNAVAILABLE",
  )

  const preserved = await getMembership(shop.id, existing.id)
  assert.equal(preserved?.status, "ACTIVE")
  assert.equal(preserved?.planNameSnapshot, plan.name)

  await updateMembershipPlan(shop.id, plan.id, {
    name: plan.name,
    description: plan.description,
    price: plan.price.toFixed(2),
    benefits: plan.benefits,
    active: true,
    entitlements: [],
  })
  await archiveMembershipPlan(shop.id, plan.id)

  const thirdCustomer = await createCustomer(shop.id, "third")
  await expectMembershipCode(
    () =>
      enrollExistingCustomerMembership(
        shop.id,
        thirdCustomer.id,
        plan.id,
        fixedClock,
      ),
    "PLAN_UNAVAILABLE",
  )
})

test("new Customer enrollment is atomic and creates no User", async () => {
  const shop = await createShop("new-customer")
  const service = await createService(shop.id, "Included")
  const plan = await createPlan(shop.id, {
    services: [{ serviceId: service.id, usageLimitPerCycle: 2 }],
  })
  const usersBefore = await db.user.count()
  const customersBefore = await db.customer.count({
    where: { barbershopId: shop.id },
  })

  const membership = await enrollNewCustomerMembership(
    shop.id,
    plan.id,
    {
      name: "New Club Customer",
      phone: "+351 912 345 678",
      email: "new@example.test",
    },
    fixedClock,
  )

  assert.equal(
    await db.customer.count({ where: { barbershopId: shop.id } }),
    customersBefore + 1,
  )
  assert.equal(await db.user.count(), usersBefore)
  assert.equal(membership.customer.name, "New Club Customer")
  assert.equal(membership.entitlements.length, 1)

  await updateMembershipPlan(shop.id, plan.id, {
    name: plan.name,
    description: plan.description,
    price: plan.price.toFixed(2),
    benefits: plan.benefits,
    active: false,
    entitlements: [
      { serviceId: service.id, usageLimitPerCycle: 2 },
    ],
  })

  const beforeFailure = await db.customer.count({
    where: { barbershopId: shop.id },
  })
  await expectMembershipCode(
    () =>
      enrollNewCustomerMembership(
        shop.id,
        plan.id,
        {
          name: "Orphan Candidate",
          phone: "+351 919 999 999",
          email: undefined,
        },
        fixedClock,
      ),
    "PLAN_UNAVAILABLE",
  )
  assert.equal(
    await db.customer.count({ where: { barbershopId: shop.id } }),
    beforeFailure,
  )
})

test("new Customer enrollment does not deduplicate phone or email", async () => {
  const shop = await createShop("no-dedupe")
  const plan = await createPlan(shop.id)
  const customer = {
    name: "Repeated Identity",
    phone: "+351 913 333 333",
    email: "same@example.test",
  }

  const first = await enrollNewCustomerMembership(
    shop.id,
    plan.id,
    customer,
    fixedClock,
  )
  const second = await enrollNewCustomerMembership(
    shop.id,
    plan.id,
    customer,
    fixedClock,
  )

  assert.notEqual(first.customerId, second.customerId)
  assert.equal(
    await db.customer.count({
      where: {
        barbershopId: shop.id,
        phone: customer.phone,
      },
    }),
    2,
  )
})

test("mandatory plan and entitlement snapshot survives later plan and Service changes", async () => {
  const shop = await createShop("snapshot")
  const serviceX = await createService(shop.id, "Service X")
  const serviceY = await createService(shop.id, "Service Y")
  const plan = await createPlan(shop.id, {
    name: "Name A",
    price: "39.90",
    benefits: "Benefits A",
    services: [
      { serviceId: serviceX.id, usageLimitPerCycle: 2 },
      { serviceId: serviceY.id, usageLimitPerCycle: null },
    ],
  })
  const customerA = await createCustomer(shop.id, "snapshot-a")
  const membershipA = await enrollExistingCustomerMembership(
    shop.id,
    customerA.id,
    plan.id,
    fixedClock,
  )

  await db.service.update({
    where: { id: serviceX.id },
    data: { name: "Service X renamed" },
  })
  await updateMembershipPlan(shop.id, plan.id, {
    name: "Name B",
    description: "Changed",
    price: "49.90",
    benefits: "Benefits B",
    active: true,
    entitlements: [
      { serviceId: serviceX.id, usageLimitPerCycle: 1 },
    ],
  })

  const preserved = await getMembership(shop.id, membershipA.id)
  assert.ok(preserved)
  assert.equal(preserved.planNameSnapshot, "Name A")
  assert.equal(preserved.planPriceSnapshot.toFixed(2), "39.90")
  assert.equal(preserved.planBenefitsSnapshot, "Benefits A")
  assert.equal(preserved.entitlements.length, 2)
  const preservedX = preserved.entitlements.find(
    (entitlement) => entitlement.serviceId === serviceX.id,
  )
  const preservedY = preserved.entitlements.find(
    (entitlement) => entitlement.serviceId === serviceY.id,
  )
  assert.equal(preservedX?.serviceNameSnapshot, "Service X")
  assert.equal(preservedX?.usageLimitPerCycle, 2)
  assert.equal(preservedY?.usageLimitPerCycle, null)

  const customerB = await createCustomer(shop.id, "snapshot-b")
  const membershipB = await enrollExistingCustomerMembership(
    shop.id,
    customerB.id,
    plan.id,
    fixedClock,
  )
  assert.equal(membershipB.planNameSnapshot, "Name B")
  assert.equal(membershipB.planPriceSnapshot.toFixed(2), "49.90")
  assert.equal(membershipB.planBenefitsSnapshot, "Benefits B")
  assert.equal(membershipB.entitlements.length, 1)
  assert.equal(
    membershipB.entitlements[0]?.serviceNameSnapshot,
    "Service X renamed",
  )
  assert.equal(membershipB.entitlements[0]?.usageLimitPerCycle, 1)
})

test("Service deactivation preserves Membership entitlement history", async () => {
  const shop = await createShop("service-history")
  const service = await createService(shop.id, "Historical Service")
  const plan = await createPlan(shop.id, {
    services: [{ serviceId: service.id, usageLimitPerCycle: null }],
  })
  const customer = await createCustomer(shop.id, "service-history")
  const membership = await enrollExistingCustomerMembership(
    shop.id,
    customer.id,
    plan.id,
    fixedClock,
  )

  await db.service.update({
    where: { id: service.id },
    data: {
      name: "Changed current name",
      active: false,
    },
  })

  const stored = await getMembership(shop.id, membership.id)
  assert.equal(stored?.entitlements.length, 1)
  assert.equal(
    stored?.entitlements[0]?.serviceNameSnapshot,
    "Historical Service",
  )
  assert.equal(stored?.entitlements[0]?.service.active, false)
})

test("ACTIVE finite allowance records usage and rejects beyond limit", async () => {
  const shop = await createShop("finite-usage")
  const service = await createService(shop.id, "Finite")
  const plan = await createPlan(shop.id, {
    services: [{ serviceId: service.id, usageLimitPerCycle: 2 }],
  })
  const customer = await createCustomer(shop.id, "finite")
  const membership = await enrollExistingCustomerMembership(
    shop.id,
    customer.id,
    plan.id,
    clockAt("2030-01-01T10:00:00.000Z"),
  )
  const entitlement = membership.entitlements[0]
  assert.ok(entitlement)

  const first = await recordMembershipUsage(
    shop.id,
    membership.id,
    entitlement.id,
    clockAt("2030-01-02T10:00:00.000Z"),
  )
  assert.equal(first.usedCount, 1)
  assert.equal(first.remaining, 1)

  const second = await recordMembershipUsage(
    shop.id,
    membership.id,
    entitlement.id,
    clockAt("2030-01-03T10:00:00.000Z"),
  )
  assert.equal(second.usedCount, 2)
  assert.equal(second.remaining, 0)

  const countBefore = await db.membershipUsage.count({
    where: { membershipId: membership.id },
  })
  await expectMembershipCode(
    () =>
      recordMembershipUsage(
        shop.id,
        membership.id,
        entitlement.id,
        clockAt("2030-01-04T10:00:00.000Z"),
      ),
    "LIMIT_REACHED",
  )
  assert.equal(
    await db.membershipUsage.count({
      where: { membershipId: membership.id },
    }),
    countBefore,
  )
})

test("concurrent last finite allowance cannot oversubscribe", async () => {
  const shop = await createShop("finite-concurrency")
  const service = await createService(shop.id, "One use")
  const plan = await createPlan(shop.id, {
    services: [{ serviceId: service.id, usageLimitPerCycle: 1 }],
  })
  const customer = await createCustomer(shop.id, "race")
  const membership = await enrollExistingCustomerMembership(
    shop.id,
    customer.id,
    plan.id,
    clockAt("2030-01-01T10:00:00.000Z"),
  )
  const entitlement = membership.entitlements[0]
  assert.ok(entitlement)

  const results = await Promise.allSettled([
    recordMembershipUsage(
      shop.id,
      membership.id,
      entitlement.id,
      clockAt("2030-01-02T10:00:00.000Z"),
    ),
    recordMembershipUsage(
      shop.id,
      membership.id,
      entitlement.id,
      clockAt("2030-01-02T10:00:00.000Z"),
    ),
  ])

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  )
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  )
  const rejected = results.find(
    (result): result is PromiseRejectedResult =>
      result.status === "rejected",
  )
  assert.ok(rejected)
  assert.ok(rejected.reason instanceof ClubMembershipError)
  assert.equal(rejected.reason.code, "LIMIT_REACHED")
  assert.equal(
    await db.membershipUsage.count({
      where: {
        membershipId: membership.id,
        membershipEntitlementId: entitlement.id,
      },
    }),
    1,
  )
})

test("unlimited entitlement records every usage without finite cap", async () => {
  const shop = await createShop("unlimited")
  const service = await createService(shop.id, "Unlimited")
  const plan = await createPlan(shop.id, {
    services: [{ serviceId: service.id, usageLimitPerCycle: null }],
  })
  const customer = await createCustomer(shop.id, "unlimited")
  const membership = await enrollExistingCustomerMembership(
    shop.id,
    customer.id,
    plan.id,
    clockAt("2030-01-01T10:00:00.000Z"),
  )
  const entitlement = membership.entitlements[0]
  assert.ok(entitlement)

  for (const day of [2, 3, 4, 5, 6]) {
    const result = await recordMembershipUsage(
      shop.id,
      membership.id,
      entitlement.id,
      clockAt(
        "2030-01-" +
          String(day).padStart(2, "0") +
          "T10:00:00.000Z",
      ),
    )
    assert.equal(result.unlimited, true)
    assert.equal(result.remaining, null)
  }

  assert.equal(
    await db.membershipUsage.count({
      where: {
        membershipId: membership.id,
        membershipEntitlementId: entitlement.id,
      },
    }),
    5,
  )
})

test("usage is rejected for PAST_DUE CANCELLED and EXPIRED", async () => {
  const shop = await createShop("status-usage")
  const service = await createService(shop.id, "Status service")
  const plan = await createPlan(shop.id, {
    services: [{ serviceId: service.id, usageLimitPerCycle: 5 }],
  })

  for (const target of [
    "PAST_DUE",
    "CANCELLED",
    "EXPIRED",
  ] as const) {
    const customer = await createCustomer(shop.id, target)
    const membership = await enrollExistingCustomerMembership(
      shop.id,
      customer.id,
      plan.id,
      clockAt("2030-01-01T10:00:00.000Z"),
    )
    const entitlement = membership.entitlements[0]
    assert.ok(entitlement)
    await transitionMembershipStatus(
      shop.id,
      membership.id,
      target,
      clockAt("2030-01-02T10:00:00.000Z"),
    )

    await expectMembershipCode(
      () =>
        recordMembershipUsage(
          shop.id,
          membership.id,
          entitlement.id,
          clockAt("2030-01-03T10:00:00.000Z"),
        ),
      "USAGE_UNAVAILABLE",
    )
  }
})

test("usage outside current half-open cycle is rejected", async () => {
  const shop = await createShop("outside-cycle")
  const service = await createService(shop.id, "Cycle")
  const plan = await createPlan(shop.id, {
    services: [{ serviceId: service.id, usageLimitPerCycle: 2 }],
  })
  const customer = await createCustomer(shop.id, "cycle")
  const membership = await enrollExistingCustomerMembership(
    shop.id,
    customer.id,
    plan.id,
    clockAt("2030-01-01T10:00:00.000Z"),
  )
  const entitlement = membership.entitlements[0]
  assert.ok(entitlement)

  await expectMembershipCode(
    () =>
      recordMembershipUsage(
        shop.id,
        membership.id,
        entitlement.id,
        clockAt("2030-02-01T10:00:00.000Z"),
      ),
    "CYCLE_UNAVAILABLE",
  )
})

test("lifecycle supports accepted transitions and preserves terminal timestamps", async () => {
  const shop = await createShop("lifecycle")
  const plan = await createPlan(shop.id)

  const reversibleCustomer = await createCustomer(shop.id, "reversible")
  const reversible = await enrollExistingCustomerMembership(
    shop.id,
    reversibleCustomer.id,
    plan.id,
    fixedClock,
  )
  const pastDue = await transitionMembershipStatus(
    shop.id,
    reversible.id,
    "PAST_DUE",
    clockAt("2030-02-01T10:00:00.000Z"),
  )
  assert.equal(pastDue.status, "PAST_DUE")
  assert.equal(pastDue.cancelledAt, null)
  assert.equal(pastDue.expiredAt, null)

  const active = await transitionMembershipStatus(
    shop.id,
    reversible.id,
    "ACTIVE",
    clockAt("2030-02-02T10:00:00.000Z"),
  )
  assert.equal(active.status, "ACTIVE")

  const cancelCustomer = await createCustomer(shop.id, "cancel")
  const cancelMembership = await enrollExistingCustomerMembership(
    shop.id,
    cancelCustomer.id,
    plan.id,
    fixedClock,
  )
  const cancelledAt = "2030-02-03T10:00:00.000Z"
  const cancelled = await transitionMembershipStatus(
    shop.id,
    cancelMembership.id,
    "CANCELLED",
    clockAt(cancelledAt),
  )
  assert.equal(cancelled.status, "CANCELLED")
  assert.equal(cancelled.cancelledAt?.toISOString(), cancelledAt)

  await expectMembershipCode(
    () =>
      transitionMembershipStatus(
        shop.id,
        cancelMembership.id,
        "ACTIVE",
        clockAt("2030-02-04T10:00:00.000Z"),
      ),
    "INVALID_LIFECYCLE",
  )

  const expireCustomer = await createCustomer(shop.id, "expire")
  const expireMembership = await enrollExistingCustomerMembership(
    shop.id,
    expireCustomer.id,
    plan.id,
    fixedClock,
  )
  const expiredAt = "2030-02-05T10:00:00.000Z"
  const expired = await transitionMembershipStatus(
    shop.id,
    expireMembership.id,
    "EXPIRED",
    clockAt(expiredAt),
  )
  assert.equal(expired.status, "EXPIRED")
  assert.equal(expired.expiredAt?.toISOString(), expiredAt)

  await expectMembershipCode(
    () =>
      transitionMembershipStatus(
        shop.id,
        expireMembership.id,
        "PAST_DUE",
        clockAt("2030-02-06T10:00:00.000Z"),
      ),
    "INVALID_LIFECYCLE",
  )
})

test("terminal Membership preserves entitlement and usage history", async () => {
  const shop = await createShop("terminal-history")
  const service = await createService(shop.id, "History")
  const plan = await createPlan(shop.id, {
    services: [{ serviceId: service.id, usageLimitPerCycle: 2 }],
  })
  const customer = await createCustomer(shop.id, "history")
  const membership = await enrollExistingCustomerMembership(
    shop.id,
    customer.id,
    plan.id,
    clockAt("2030-01-01T10:00:00.000Z"),
  )
  const entitlement = membership.entitlements[0]
  assert.ok(entitlement)
  await recordMembershipUsage(
    shop.id,
    membership.id,
    entitlement.id,
    clockAt("2030-01-02T10:00:00.000Z"),
  )
  await transitionMembershipStatus(
    shop.id,
    membership.id,
    "CANCELLED",
    clockAt("2030-01-03T10:00:00.000Z"),
  )

  assert.equal(
    await db.membership.count({ where: { id: membership.id } }),
    1,
  )
  assert.equal(
    await db.membershipEntitlement.count({
      where: { membershipId: membership.id },
    }),
    1,
  )
  assert.equal(
    await db.membershipUsage.count({
      where: { membershipId: membership.id },
    }),
    1,
  )
})

test("database history relations use RESTRICT semantics", async () => {
  const shop = await createShop("restrict")
  const service = await createService(shop.id, "Restrict")
  const plan = await createPlan(shop.id, {
    services: [{ serviceId: service.id, usageLimitPerCycle: 2 }],
  })
  const customer = await createCustomer(shop.id, "restrict")
  const membership = await enrollExistingCustomerMembership(
    shop.id,
    customer.id,
    plan.id,
    clockAt("2030-01-01T10:00:00.000Z"),
  )
  const entitlement = membership.entitlements[0]
  assert.ok(entitlement)
  await recordMembershipUsage(
    shop.id,
    membership.id,
    entitlement.id,
    clockAt("2030-01-02T10:00:00.000Z"),
  )

  await assert.rejects(() =>
    db.customer.delete({ where: { id: customer.id } }),
  )
  await assert.rejects(() =>
    db.membership.delete({ where: { id: membership.id } }),
  )
  await assert.rejects(() =>
    db.membershipEntitlement.delete({
      where: { id: entitlement.id },
    }),
  )
  await assert.rejects(() =>
    db.service.delete({ where: { id: service.id } }),
  )
})

test("tenant-scoped membership helpers cannot view mutate or consume another tenant", async () => {
  const first = await createShop("tenant-a")
  const second = await createShop("tenant-b")
  const service = await createService(second.id, "B service")
  const plan = await createPlan(second.id, {
    services: [{ serviceId: service.id, usageLimitPerCycle: 2 }],
  })
  const customer = await createCustomer(second.id, "B customer")
  const membership = await enrollExistingCustomerMembership(
    second.id,
    customer.id,
    plan.id,
    clockAt("2030-01-01T10:00:00.000Z"),
  )
  const entitlement = membership.entitlements[0]
  assert.ok(entitlement)

  assert.equal(await getMembership(first.id, membership.id), null)
  assert.deepEqual(await getMemberships(first.id), [])
  await expectMembershipCode(
    () =>
      transitionMembershipStatus(
        first.id,
        membership.id,
        "PAST_DUE",
        clockAt("2030-01-02T10:00:00.000Z"),
      ),
    "NOT_FOUND",
  )
  await expectMembershipCode(
    () =>
      recordMembershipUsage(
        first.id,
        membership.id,
        entitlement.id,
        clockAt("2030-01-02T10:00:00.000Z"),
      ),
    "NOT_FOUND",
  )
})

test("entitlement selector from another Membership cannot be consumed", async () => {
  const shop = await createShop("selector-integrity")
  const service = await createService(shop.id, "Selector")
  const plan = await createPlan(shop.id, {
    services: [{ serviceId: service.id, usageLimitPerCycle: 2 }],
  })
  const firstCustomer = await createCustomer(shop.id, "first")
  const secondCustomer = await createCustomer(shop.id, "second")
  const first = await enrollExistingCustomerMembership(
    shop.id,
    firstCustomer.id,
    plan.id,
    clockAt("2030-01-01T10:00:00.000Z"),
  )
  const second = await enrollExistingCustomerMembership(
    shop.id,
    secondCustomer.id,
    plan.id,
    clockAt("2030-01-01T10:00:00.000Z"),
  )
  const secondEntitlement = second.entitlements[0]
  assert.ok(secondEntitlement)

  await expectMembershipCode(
    () =>
      recordMembershipUsage(
        shop.id,
        first.id,
        secondEntitlement.id,
        clockAt("2030-01-02T10:00:00.000Z"),
      ),
    "ENTITLEMENT_UNAVAILABLE",
  )
})

test("OWNER and ADMIN pass membership write authorization while STAFF is denied", async () => {
  const shop = await createShop("authorization")
  const owner = await createIdentity(shop.id, "OWNER", "owner")
  const admin = await createIdentity(shop.id, "ADMIN", "admin")
  const staff = await createIdentity(shop.id, "STAFF", "staff")

  const ownerAccess = await requireTenantMembershipIdentity(
    owner.id,
    shop.id,
    accessRepository,
    ["OWNER", "ADMIN"],
  )
  const adminAccess = await requireTenantMembershipIdentity(
    admin.id,
    shop.id,
    accessRepository,
    ["OWNER", "ADMIN"],
  )
  assert.equal(ownerAccess.membership.role, "OWNER")
  assert.equal(adminAccess.membership.role, "ADMIN")

  await assert.rejects(
    () =>
      requireTenantMembershipIdentity(
        staff.id,
        shop.id,
        accessRepository,
        ["OWNER", "ADMIN"],
      ),
    (error: unknown) => {
      assert.ok(error instanceof AuthorizationError)
      assert.equal(error.code, "FORBIDDEN")
      return true
    },
  )
})

test("Club membership actions reuse privilegedWrite and STAFF UI stays read-only", () => {
  const actions = readFileSync(
    "app/(admin)/admin/[slug]/club/membership-actions.ts",
    "utf8",
  )
  const section = readFileSync(
    "app/(admin)/admin/[slug]/club/membership-section.tsx",
    "utf8",
  )
  const page = readFileSync(
    "app/(admin)/admin/[slug]/club/page.tsx",
    "utf8",
  )

  assert.match(
    actions,
    /requireBarbershopBySlug\(rawSlug, \["OWNER", "ADMIN"\]\)/,
  )
  assert.match(actions, /"privilegedWrite"/)
  assert.match(actions, /hashRateLimitKey/)
  assert.equal(actions.includes("barbershopId: form"), false)
  assert.match(section, /role === "OWNER" \|\| role === "ADMIN"/)
  assert.match(section, /role STAFF permite consultar/)
  assert.match(page, /ClubMembershipSection/)
})

test("normal Membership domain exposes no hard-delete or usage reset path", () => {
  const source = readFileSync("lib/club-memberships.ts", "utf8")
  assert.equal(source.includes("membership.delete("), false)
  assert.equal(source.includes("membership.deleteMany("), false)
  assert.equal(source.includes("membershipEntitlement.delete("), false)
  assert.equal(source.includes("membershipEntitlement.deleteMany("), false)
  assert.equal(source.includes("membershipUsage.delete("), false)
  assert.equal(source.includes("membershipUsage.deleteMany("), false)
  assert.match(source, /membershipUsage\.create\(/)
})

test("005B membership domain remains independent from billing providers renewal and Booking integration", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8")
  const domain = readFileSync("lib/club-memberships.ts", "utf8")
  const booking = readFileSync("lib/booking-engine.ts", "utf8")

  assert.match(schema, /enum MembershipStatus/)
  assert.match(schema, /model Membership\s*\{/)
  assert.match(schema, /model MembershipEntitlement\s*\{/)
  assert.match(schema, /model MembershipUsage\s*\{/)
  assert.equal(domain.includes("user.create"), false)
  assert.equal(domain.includes("Payment"), false)
  assert.equal(domain.includes("PlatformSubscription"), false)
  assert.equal(domain.includes("stripe"), false)
  assert.equal(domain.includes("setInterval"), false)
  assert.equal(domain.includes("Booking"), false)
  assert.equal(booking.includes("MembershipUsage"), false)
})

import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import {
  BillingDomainError,
  getPayment,
  getPlatformSubscription,
  listMembershipPayments,
  transitionPaymentStatus,
  transitionPlatformSubscriptionStatus,
  type BillingClock,
} from "../lib/billing-domain"
import { createMembershipPlan } from "../lib/club-plans"
import { enrollExistingCustomerMembership } from "../lib/club-memberships"
import { db, getPool } from "../lib/prisma"

const createdShopIds: string[] = []

const clockAt = (iso: string): BillingClock => ({
  now: () => new Date(iso),
})

const createShop = async (tag: string) => {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10)
  const shop = await db.barbershop.create({
    data: {
      name: "Billing " + tag,
      slug:
        "billing-" +
        tag.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
        "-" +
        suffix,
      timezone: "UTC",
    },
  })
  createdShopIds.push(shop.id)
  return shop
}

const createMembershipFixture = async (tag: string) => {
  const shop = await createShop(tag)
  const customer = await db.customer.create({
    data: {
      barbershopId: shop.id,
      name: "Customer " + tag,
      phone: "+351 910 222 333",
      email: null,
    },
  })
  const plan = await createMembershipPlan(shop.id, {
    name: "Club " + tag,
    description: null,
    price: "39.90",
    benefits: null,
    active: true,
    entitlements: [],
  })
  const membership = await enrollExistingCustomerMembership(
    shop.id,
    customer.id,
    plan.id,
    {
      now: () => new Date("2030-01-01T10:00:00.000Z"),
    },
  )

  return { shop, customer, plan, membership }
}

const createPendingPayment = async (
  fixture: Awaited<ReturnType<typeof createMembershipFixture>>,
  overrides?: {
    amount?: string
    currency?: string
    providerKey?: string | null
    externalPaymentRef?: string | null
  },
) =>
  db.payment.create({
    data: {
      barbershopId: fixture.shop.id,
      membershipId: fixture.membership.id,
      amount: overrides?.amount ?? "39.90",
      currency: overrides?.currency ?? "EUR",
      cycleStartsAtSnapshot: fixture.membership.currentCycleStartsAt,
      cycleEndsAtSnapshot: fixture.membership.currentCycleEndsAt,
      providerKey: overrides?.providerKey ?? null,
      externalPaymentRef: overrides?.externalPaymentRef ?? null,
    },
  })

const createPlatformSubscription = async (
  barbershopId: string,
  overrides?: {
    status?: "ACTIVE" | "PAST_DUE" | "SUSPENDED"
    priceSnapshot?: string
    currency?: string
    providerKey?: string | null
    externalCustomerRef?: string | null
    externalSubscriptionRef?: string | null
  },
) =>
  db.platformSubscription.create({
    data: {
      barbershopId,
      status: overrides?.status ?? "ACTIVE",
      planKey: "starter",
      priceSnapshot: overrides?.priceSnapshot ?? "29.90",
      currency: overrides?.currency ?? "EUR",
      currentPeriodStartsAt: new Date("2030-01-01T00:00:00.000Z"),
      currentPeriodEndsAt: new Date("2030-02-01T00:00:00.000Z"),
      providerKey: overrides?.providerKey ?? null,
      externalCustomerRef: overrides?.externalCustomerRef ?? null,
      externalSubscriptionRef: overrides?.externalSubscriptionRef ?? null,
    },
  })

const expectBillingCode = async (
  action: () => Promise<unknown>,
  code: "NOT_FOUND" | "INVALID_LIFECYCLE" | "INVALID_CLOCK",
) => {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof BillingDomainError)
    assert.equal(error.code, code)
    return true
  })
}

const listFilesRecursive = (root: string): string[] => {
  if (!existsSync(root)) return []

  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry)
    return statSync(path).isDirectory()
      ? listFilesRecursive(path)
      : [path]
  })
}

after(async () => {
  if (createdShopIds.length > 0) {
    await db.payment.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.platformSubscription.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
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

  await db.$disconnect()
  await getPool().end()
})

test("Payment database rejects negative amount", async () => {
  const fixture = await createMembershipFixture("negative-payment")

  await assert.rejects(() =>
    createPendingPayment(fixture, { amount: "-0.01" }),
  )
})

test("Payment database rejects invalid currency shape", async () => {
  const fixture = await createMembershipFixture("payment-currency")

  for (const currency of ["eur", "EU", "EURO", "E1R"]) {
    await assert.rejects(() =>
      createPendingPayment(fixture, { currency }),
    )
  }
})

test("Payment database rejects invalid cycle range", async () => {
  const fixture = await createMembershipFixture("payment-cycle")

  await assert.rejects(() =>
    db.payment.create({
      data: {
        barbershopId: fixture.shop.id,
        membershipId: fixture.membership.id,
        amount: "39.90",
        currency: "EUR",
        cycleStartsAtSnapshot: new Date("2030-02-01T00:00:00.000Z"),
        cycleEndsAtSnapshot: new Date("2030-02-01T00:00:00.000Z"),
      },
    }),
  )
})

test("Payment database rejects cross-tenant Membership relation", async () => {
  const first = await createMembershipFixture("payment-cross-a")
  const second = await createMembershipFixture("payment-cross-b")

  await assert.rejects(() =>
    db.payment.create({
      data: {
        barbershopId: first.shop.id,
        membershipId: second.membership.id,
        amount: "39.90",
        currency: "EUR",
        cycleStartsAtSnapshot: second.membership.currentCycleStartsAt,
        cycleEndsAtSnapshot: second.membership.currentCycleEndsAt,
      },
    }),
  )
})

test("Payment provider references require complete pair", async () => {
  const fixture = await createMembershipFixture("payment-provider-pair")

  await assert.rejects(() =>
    createPendingPayment(fixture, {
      providerKey: "provider-a",
      externalPaymentRef: null,
    }),
  )

  await assert.rejects(() =>
    createPendingPayment(fixture, {
      providerKey: null,
      externalPaymentRef: "pay-1",
    }),
  )

  const noProvider = await createPendingPayment(fixture)
  assert.equal(noProvider.providerKey, null)
  assert.equal(noProvider.externalPaymentRef, null)
  assert.equal(noProvider.status, "PENDING")
})

test("Payment provider pair is unique idempotency anchor", async () => {
  const fixture = await createMembershipFixture("payment-idempotency")
  await createPendingPayment(fixture, {
    providerKey: "provider-a",
    externalPaymentRef: "payment-123",
  })

  await assert.rejects(() =>
    createPendingPayment(fixture, {
      providerKey: "provider-a",
      externalPaymentRef: "payment-123",
    }),
  )

  const otherProvider = await createPendingPayment(fixture, {
    providerKey: "provider-b",
    externalPaymentRef: "payment-123",
  })
  assert.equal(otherProvider.providerKey, "provider-b")
})

test("Payment database enforces status timestamp shapes", async () => {
  const fixture = await createMembershipFixture("payment-shape")
  const base = {
    barbershopId: fixture.shop.id,
    membershipId: fixture.membership.id,
    amount: "39.90",
    currency: "EUR",
    cycleStartsAtSnapshot: fixture.membership.currentCycleStartsAt,
    cycleEndsAtSnapshot: fixture.membership.currentCycleEndsAt,
  }
  const instant = new Date("2030-01-02T00:00:00.000Z")

  await assert.rejects(() =>
    db.payment.create({
      data: {
        ...base,
        status: "PENDING",
        paidAt: instant,
      },
    }),
  )

  await assert.rejects(() =>
    db.payment.create({
      data: {
        ...base,
        status: "SUCCEEDED",
      },
    }),
  )

  await assert.rejects(() =>
    db.payment.create({
      data: {
        ...base,
        status: "FAILED",
        paidAt: instant,
      },
    }),
  )

  await assert.rejects(() =>
    db.payment.create({
      data: {
        ...base,
        status: "REFUNDED",
        refundedAt: instant,
      },
    }),
  )

  const succeeded = await db.payment.create({
    data: {
      ...base,
      status: "SUCCEEDED",
      paidAt: instant,
    },
  })
  assert.equal(succeeded.status, "SUCCEEDED")
})

test("PlatformSubscription database rejects negative price snapshot", async () => {
  const shop = await createShop("platform-negative")

  await assert.rejects(() =>
    createPlatformSubscription(shop.id, {
      priceSnapshot: "-0.01",
    }),
  )
})

test("PlatformSubscription database rejects invalid currency", async () => {
  const shop = await createShop("platform-currency")

  await assert.rejects(() =>
    createPlatformSubscription(shop.id, {
      currency: "usd",
    }),
  )
})

test("PlatformSubscription database rejects invalid period", async () => {
  const shop = await createShop("platform-period")

  await assert.rejects(() =>
    db.platformSubscription.create({
      data: {
        barbershopId: shop.id,
        status: "ACTIVE",
        planKey: "starter",
        priceSnapshot: "29.90",
        currency: "EUR",
        currentPeriodStartsAt: new Date("2030-02-01T00:00:00.000Z"),
        currentPeriodEndsAt: new Date("2030-02-01T00:00:00.000Z"),
      },
    }),
  )
})

test("PlatformSubscription database allows only one row per Barbershop", async () => {
  const shop = await createShop("platform-one")
  await createPlatformSubscription(shop.id)

  await assert.rejects(() =>
    createPlatformSubscription(shop.id),
  )
})

test("PlatformSubscription database rejects invalid Barbershop relation", async () => {
  await assert.rejects(() =>
    createPlatformSubscription(randomUUID()),
  )
})

test("Platform provider subscription reference requires provider and is unique by provider", async () => {
  const first = await createShop("platform-provider-a")
  const second = await createShop("platform-provider-b")
  const third = await createShop("platform-provider-c")

  await assert.rejects(() =>
    createPlatformSubscription(first.id, {
      providerKey: null,
      externalSubscriptionRef: "subscription-1",
    }),
  )

  await createPlatformSubscription(first.id, {
    providerKey: "provider-a",
    externalCustomerRef: "customer-1",
    externalSubscriptionRef: "subscription-1",
  })

  await assert.rejects(() =>
    createPlatformSubscription(second.id, {
      providerKey: "provider-a",
      externalSubscriptionRef: "subscription-1",
    }),
  )

  const differentProvider = await createPlatformSubscription(third.id, {
    providerKey: "provider-b",
    externalSubscriptionRef: "subscription-1",
  })
  assert.equal(differentProvider.providerKey, "provider-b")
})

test("Payment PENDING transitions to SUCCEEDED and sets paidAt only", async () => {
  const fixture = await createMembershipFixture("pending-success")
  const payment = await createPendingPayment(fixture)
  const membershipBefore = await db.membership.findUniqueOrThrow({
    where: { id: fixture.membership.id },
  })

  const updated = await transitionPaymentStatus(
    fixture.shop.id,
    payment.id,
    "SUCCEEDED",
    clockAt("2030-01-05T12:00:00.000Z"),
  )

  assert.equal(updated.status, "SUCCEEDED")
  assert.equal(updated.paidAt?.toISOString(), "2030-01-05T12:00:00.000Z")
  assert.equal(updated.failedAt, null)
  assert.equal(updated.refundedAt, null)

  const membershipAfter = await db.membership.findUniqueOrThrow({
    where: { id: fixture.membership.id },
  })
  assert.equal(membershipAfter.status, membershipBefore.status)
  assert.equal(
    membershipAfter.currentCycleStartsAt.toISOString(),
    membershipBefore.currentCycleStartsAt.toISOString(),
  )
  assert.equal(
    membershipAfter.currentCycleEndsAt.toISOString(),
    membershipBefore.currentCycleEndsAt.toISOString(),
  )
})

test("Payment PENDING transitions to FAILED and retry requires a new Payment", async () => {
  const fixture = await createMembershipFixture("pending-failed")
  const payment = await createPendingPayment(fixture)

  const failed = await transitionPaymentStatus(
    fixture.shop.id,
    payment.id,
    "FAILED",
    clockAt("2030-01-05T12:00:00.000Z"),
  )
  assert.equal(failed.status, "FAILED")
  assert.equal(failed.failedAt?.toISOString(), "2030-01-05T12:00:00.000Z")
  assert.equal(failed.paidAt, null)

  await expectBillingCode(
    () =>
      transitionPaymentStatus(
        fixture.shop.id,
        payment.id,
        "PENDING",
      ),
    "INVALID_LIFECYCLE",
  )

  const retry = await createPendingPayment(fixture)
  assert.notEqual(retry.id, payment.id)
  assert.equal(retry.status, "PENDING")
})

test("Payment SUCCEEDED transitions to REFUNDED and REFUNDED is terminal", async () => {
  const fixture = await createMembershipFixture("refund")
  const payment = await createPendingPayment(fixture)
  const succeeded = await transitionPaymentStatus(
    fixture.shop.id,
    payment.id,
    "SUCCEEDED",
    clockAt("2030-01-05T12:00:00.000Z"),
  )

  const refunded = await transitionPaymentStatus(
    fixture.shop.id,
    succeeded.id,
    "REFUNDED",
    clockAt("2030-01-06T12:00:00.000Z"),
  )

  assert.equal(refunded.status, "REFUNDED")
  assert.equal(refunded.paidAt?.toISOString(), "2030-01-05T12:00:00.000Z")
  assert.equal(
    refunded.refundedAt?.toISOString(),
    "2030-01-06T12:00:00.000Z",
  )
  assert.equal(refunded.failedAt, null)

  await expectBillingCode(
    () =>
      transitionPaymentStatus(
        fixture.shop.id,
        refunded.id,
        "SUCCEEDED",
      ),
    "INVALID_LIFECYCLE",
  )
})

test("Payment lifecycle is tenant-scoped", async () => {
  const first = await createMembershipFixture("payment-scope-a")
  const second = await createMembershipFixture("payment-scope-b")
  const payment = await createPendingPayment(second)

  await expectBillingCode(
    () =>
      transitionPaymentStatus(
        first.shop.id,
        payment.id,
        "SUCCEEDED",
      ),
    "NOT_FOUND",
  )

  assert.equal(await getPayment(first.shop.id, payment.id), null)
  assert.equal(
    (await getPayment(second.shop.id, payment.id))?.id,
    payment.id,
  )
})

test("Payment queries list only requested tenant Membership", async () => {
  const first = await createMembershipFixture("payment-list-a")
  const second = await createMembershipFixture("payment-list-b")
  await createPendingPayment(first)
  await createPendingPayment(first)
  await createPendingPayment(second)

  assert.equal(
    (
      await listMembershipPayments(
        first.shop.id,
        first.membership.id,
      )
    ).length,
    2,
  )
  assert.equal(
    (
      await listMembershipPayments(
        first.shop.id,
        second.membership.id,
      )
    ).length,
    0,
  )
})

test("Platform lifecycle supports ACTIVE PAST_DUE SUSPENDED transitions without Barbershop suspension", async () => {
  const shop = await createShop("platform-lifecycle")
  await createPlatformSubscription(shop.id)

  const pastDue = await transitionPlatformSubscriptionStatus(
    shop.id,
    "PAST_DUE",
  )
  assert.equal(pastDue.status, "PAST_DUE")

  const activeAgain = await transitionPlatformSubscriptionStatus(
    shop.id,
    "ACTIVE",
  )
  assert.equal(activeAgain.status, "ACTIVE")

  await transitionPlatformSubscriptionStatus(shop.id, "PAST_DUE")
  const suspended = await transitionPlatformSubscriptionStatus(
    shop.id,
    "SUSPENDED",
  )
  assert.equal(suspended.status, "SUSPENDED")

  const restored = await transitionPlatformSubscriptionStatus(
    shop.id,
    "ACTIVE",
  )
  assert.equal(restored.status, "ACTIVE")

  const storedShop = await db.barbershop.findUniqueOrThrow({
    where: { id: shop.id },
  })
  assert.equal(storedShop.status, "ACTIVE")
})

test("Platform lifecycle rejects unsupported transitions", async () => {
  const first = await createShop("platform-invalid-a")
  await createPlatformSubscription(first.id)

  await expectBillingCode(
    () =>
      transitionPlatformSubscriptionStatus(
        first.id,
        "SUSPENDED",
      ),
    "INVALID_LIFECYCLE",
  )

  const second = await createShop("platform-invalid-b")
  await createPlatformSubscription(second.id, {
    status: "SUSPENDED",
  })

  await expectBillingCode(
    () =>
      transitionPlatformSubscriptionStatus(
        second.id,
        "PAST_DUE",
      ),
    "INVALID_LIFECYCLE",
  )
})

test("Platform query is scoped by Barbershop", async () => {
  const first = await createShop("platform-query-a")
  const second = await createShop("platform-query-b")
  const subscription = await createPlatformSubscription(second.id)

  assert.equal(await getPlatformSubscription(first.id), null)
  assert.equal(
    (await getPlatformSubscription(second.id))?.id,
    subscription.id,
  )
})

test("money flows remain structurally separated", async () => {
  const fixture = await createMembershipFixture("flow-separation")
  const payment = await createPendingPayment(fixture)
  const platform = await createPlatformSubscription(fixture.shop.id)

  const platformBefore = await getPlatformSubscription(fixture.shop.id)
  await transitionPaymentStatus(
    fixture.shop.id,
    payment.id,
    "SUCCEEDED",
    clockAt("2030-01-05T00:00:00.000Z"),
  )
  const platformAfter = await getPlatformSubscription(fixture.shop.id)
  assert.equal(platformAfter?.status, platformBefore?.status)

  const paymentBeforePlatformChange = await getPayment(
    fixture.shop.id,
    payment.id,
  )
  await transitionPlatformSubscriptionStatus(
    fixture.shop.id,
    "PAST_DUE",
  )
  const paymentAfterPlatformChange = await getPayment(
    fixture.shop.id,
    payment.id,
  )
  assert.equal(
    paymentAfterPlatformChange?.status,
    paymentBeforePlatformChange?.status,
  )

  const schema = readFileSync("prisma/schema.prisma", "utf8")
  const paymentBlock = schema.match(/model Payment \{[\s\S]*?\n\}/)?.[0] ?? ""
  const platformBlock =
    schema.match(/model PlatformSubscription \{[\s\S]*?\n\}/)?.[0] ?? ""

  assert.match(paymentBlock, /membershipId/)
  assert.match(paymentBlock, /membership Membership/)
  assert.equal(platformBlock.includes("membershipId"), false)
  assert.equal(platformBlock.includes("Membership"), false)
  assert.equal(platform.id.length > 0, true)
})

test("billing domain exposes no normal hard-delete path", () => {
  const source = readFileSync("lib/billing-domain.ts", "utf8")

  assert.equal(source.includes("payment.delete("), false)
  assert.equal(source.includes("payment.deleteMany("), false)
  assert.equal(source.includes("platformSubscription.delete("), false)
  assert.equal(source.includes("platformSubscription.deleteMany("), false)
})

test("financial history relations are RESTRICT protected", async () => {
  const fixture = await createMembershipFixture("billing-restrict")
  await createPendingPayment(fixture)
  await createPlatformSubscription(fixture.shop.id)

  await assert.rejects(() =>
    db.membership.delete({
      where: { id: fixture.membership.id },
    }),
  )

  await assert.rejects(() =>
    db.barbershop.delete({
      where: { id: fixture.shop.id },
    }),
  )
})

test("006A selects no payment provider and adds no checkout webhook or SDK", () => {
  const packageJson = readFileSync("package.json", "utf8").toLowerCase()
  const domain = readFileSync("lib/billing-domain.ts", "utf8").toLowerCase()
  const contracts = readFileSync("lib/billing-contracts.ts", "utf8").toLowerCase()
  const appFiles = listFilesRecursive("app").map((path) =>
    path.replaceAll("\\", "/").toLowerCase(),
  )

  for (const provider of [
    "stripe",
    "mollie",
    "adyen",
    "braintree",
    "square",
  ]) {
    assert.equal(packageJson.includes(provider), false)
    assert.equal(domain.includes(provider), false)
    assert.equal(contracts.includes(provider), false)
  }

  assert.equal(appFiles.some((path) => path.includes("webhook")), false)
  assert.equal(appFiles.some((path) => path.includes("checkout")), false)
  assert.equal(domain.includes("fetch("), false)
})

test("provider-neutral contracts keep Club merchant and FADEGO platform capabilities distinct", () => {
  const source = readFileSync("lib/billing-contracts.ts", "utf8")

  assert.match(source, /interface ClubMerchantBillingProvider/)
  assert.match(source, /interface PlatformSaasBillingProvider/)
  assert.match(source, /membershipId/)
  assert.match(source, /planKey/)
  assert.equal(source.includes("class "), false)
  assert.equal(source.includes("fetch("), false)
})

test("billing transitions do not mutate Membership cycle or status", async () => {
  const fixture = await createMembershipFixture("membership-non-effect")
  const payment = await createPendingPayment(fixture)
  await createPlatformSubscription(fixture.shop.id)

  const before = await db.membership.findUniqueOrThrow({
    where: { id: fixture.membership.id },
  })

  await transitionPaymentStatus(
    fixture.shop.id,
    payment.id,
    "SUCCEEDED",
    clockAt("2030-01-05T00:00:00.000Z"),
  )
  await transitionPlatformSubscriptionStatus(
    fixture.shop.id,
    "PAST_DUE",
  )

  const after = await db.membership.findUniqueOrThrow({
    where: { id: fixture.membership.id },
  })

  assert.equal(after.status, before.status)
  assert.equal(
    after.currentCycleStartsAt.toISOString(),
    before.currentCycleStartsAt.toISOString(),
  )
  assert.equal(
    after.currentCycleEndsAt.toISOString(),
    before.currentCycleEndsAt.toISOString(),
  )
})

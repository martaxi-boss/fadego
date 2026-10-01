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
  ClubPlanError,
  createMembershipPlan,
  getMembershipPlan,
  getMembershipPlans,
  updateMembershipPlan,
} from "../lib/club-plans"
import {
  membershipPlanInputSchema,
  type MembershipPlanInput,
} from "../lib/club-plan-validation"
import { db, getPool } from "../lib/prisma"

const createdShopIds: string[] = []
const createdUserIds: string[] = []

const createShop = async (tag: string) => {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10)
  const shop = await db.barbershop.create({
    data: {
      name: `Club ${tag}`,
      slug: `club-${tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}`,
    },
  })
  createdShopIds.push(shop.id)
  return shop
}

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

const planInput = (
  overrides: Partial<MembershipPlanInput> = {},
): MembershipPlanInput => ({
  name: "Club Flexível",
  description: "Plano configurado pela barbearia.",
  price: "39.90",
  benefits: "Prioridade e benefício livre.",
  active: true,
  entitlements: [],
  ...overrides,
})

const expectClubCode = async (
  action: () => Promise<unknown>,
  code: "NOT_FOUND" | "INVALID_ASSIGNMENT" | "INVALID_LIFECYCLE",
) => {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof ClubPlanError)
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
      name: `Club ${role}`,
      email: `club-${tag}-${randomUUID()}@example.test`,
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

test("Club plan validation accepts generic finite and unlimited entitlements", () => {
  const first = randomUUID()
  const second = randomUUID()
  const parsed = membershipPlanInputSchema.safeParse({
    name: "  Plano Livre  ",
    description: "  descrição  ",
    price: "39,90",
    benefits: "  benefício livre  ",
    active: "true",
    entitlements: [
      { serviceId: first, usageLimitPerCycle: "2" },
      { serviceId: second, usageLimitPerCycle: null },
    ],
  })

  assert.equal(parsed.success, true)
  if (!parsed.success) return
  assert.equal(parsed.data.name, "Plano Livre")
  assert.equal(parsed.data.price, "39.90")
  assert.equal(parsed.data.entitlements[0]?.usageLimitPerCycle, 2)
  assert.equal(parsed.data.entitlements[1]?.usageLimitPerCycle, null)
})

test("Club plan validation rejects zero negative fractional and duplicate limits", () => {
  const serviceId = randomUUID()

  for (const value of ["0", "-1", "1.5", "10000"]) {
    const parsed = membershipPlanInputSchema.safeParse({
      name: "Plan",
      description: "",
      price: "10.00",
      benefits: "",
      active: "true",
      entitlements: [{ serviceId, usageLimitPerCycle: value }],
    })
    assert.equal(parsed.success, false)
  }

  const duplicate = membershipPlanInputSchema.safeParse({
    name: "Plan",
    description: "",
    price: "10.00",
    benefits: "",
    active: "true",
    entitlements: [
      { serviceId, usageLimitPerCycle: "1" },
      { serviceId, usageLimitPerCycle: null },
    ],
  })
  assert.equal(duplicate.success, false)
})

test("PostgreSQL rejects negative MembershipPlan price", async () => {
  const shop = await createShop("negative-price")

  await assert.rejects(() =>
    db.membershipPlan.create({
      data: {
        barbershopId: shop.id,
        name: "Negative",
        price: "-0.01",
      },
    }),
  )
})

test("PostgreSQL accepts null unlimited and positive usage limits but rejects zero and negative", async () => {
  const shop = await createShop("usage-limits")
  const services = await Promise.all([
    createService(shop.id, "Unlimited"),
    createService(shop.id, "Finite"),
    createService(shop.id, "Zero"),
    createService(shop.id, "Negative"),
  ])
  const plan = await db.membershipPlan.create({
    data: {
      barbershopId: shop.id,
      name: "Limits",
      price: "12.00",
    },
  })

  await db.membershipPlanService.create({
    data: {
      barbershopId: shop.id,
      membershipPlanId: plan.id,
      serviceId: services[0]!.id,
      usageLimitPerCycle: null,
    },
  })
  await db.membershipPlanService.create({
    data: {
      barbershopId: shop.id,
      membershipPlanId: plan.id,
      serviceId: services[1]!.id,
      usageLimitPerCycle: 4,
    },
  })

  await assert.rejects(() =>
    db.membershipPlanService.create({
      data: {
        barbershopId: shop.id,
        membershipPlanId: plan.id,
        serviceId: services[2]!.id,
        usageLimitPerCycle: 0,
      },
    }),
  )
  await assert.rejects(() =>
    db.membershipPlanService.create({
      data: {
        barbershopId: shop.id,
        membershipPlanId: plan.id,
        serviceId: services[3]!.id,
        usageLimitPerCycle: -1,
      },
    }),
  )
})

test("PostgreSQL prevents cross-tenant plan and Service entitlement relations", async () => {
  const first = await createShop("cross-a")
  const second = await createShop("cross-b")
  const firstService = await createService(first.id, "A service")
  const secondService = await createService(second.id, "B service")
  const firstPlan = await db.membershipPlan.create({
    data: {
      barbershopId: first.id,
      name: "A plan",
      price: "10.00",
    },
  })
  const secondPlan = await db.membershipPlan.create({
    data: {
      barbershopId: second.id,
      name: "B plan",
      price: "20.00",
    },
  })

  await assert.rejects(() =>
    db.membershipPlanService.create({
      data: {
        barbershopId: first.id,
        membershipPlanId: secondPlan.id,
        serviceId: firstService.id,
        usageLimitPerCycle: 1,
      },
    }),
  )

  await assert.rejects(() =>
    db.membershipPlanService.create({
      data: {
        barbershopId: first.id,
        membershipPlanId: firstPlan.id,
        serviceId: secondService.id,
        usageLimitPerCycle: 1,
      },
    }),
  )
})

test("PostgreSQL rejects duplicate Service entitlement in one plan", async () => {
  const shop = await createShop("duplicate")
  const service = await createService(shop.id, "Same service")
  const plan = await db.membershipPlan.create({
    data: {
      barbershopId: shop.id,
      name: "Duplicate",
      price: "10.00",
    },
  })

  await db.membershipPlanService.create({
    data: {
      barbershopId: shop.id,
      membershipPlanId: plan.id,
      serviceId: service.id,
      usageLimitPerCycle: 1,
    },
  })

  await assert.rejects(() =>
    db.membershipPlanService.create({
      data: {
        barbershopId: shop.id,
        membershipPlanId: plan.id,
        serviceId: service.id,
        usageLimitPerCycle: 2,
      },
    }),
  )
})

test("PostgreSQL enforces archived plan as inactive", async () => {
  const shop = await createShop("archive-shape")

  await assert.rejects(() =>
    db.membershipPlan.create({
      data: {
        barbershopId: shop.id,
        name: "Bad archive",
        price: "10.00",
        active: true,
        archivedAt: new Date(),
      },
    }),
  )
})

test("OWNER can authorize and create a tenant Club plan", async () => {
  const shop = await createShop("owner-create")
  const service = await createService(shop.id, "Owner service")
  const owner = await createIdentity(shop.id, "OWNER", "owner")

  const access = await requireTenantMembershipIdentity(
    owner.id,
    shop.id,
    accessRepository,
    ["OWNER", "ADMIN"],
  )
  assert.equal(access.membership.role, "OWNER")

  const plan = await createMembershipPlan(
    access.membership.barbershopId,
    planInput({
      entitlements: [
        { serviceId: service.id, usageLimitPerCycle: 2 },
      ],
    }),
  )
  assert.equal(plan.barbershopId, shop.id)
  assert.equal(plan.services.length, 1)
})

test("ADMIN can create edit deactivate and reactivate an unarchived plan", async () => {
  const shop = await createShop("admin-edit")
  const service = await createService(shop.id, "Admin service")
  const admin = await createIdentity(shop.id, "ADMIN", "admin")

  const access = await requireTenantMembershipIdentity(
    admin.id,
    shop.id,
    accessRepository,
    ["OWNER", "ADMIN"],
  )
  const created = await createMembershipPlan(
    access.membership.barbershopId,
    planInput({
      active: true,
      entitlements: [
        { serviceId: service.id, usageLimitPerCycle: 1 },
      ],
    }),
  )

  const inactive = await updateMembershipPlan(
    shop.id,
    created.id,
    planInput({
      name: "Edited",
      active: false,
      price: "22.50",
      entitlements: [
        { serviceId: service.id, usageLimitPerCycle: null },
      ],
    }),
  )
  assert.equal(inactive.active, false)
  assert.equal(inactive.name, "Edited")
  assert.equal(inactive.services[0]?.usageLimitPerCycle, null)

  const reactivated = await updateMembershipPlan(
    shop.id,
    created.id,
    planInput({
      name: "Edited",
      active: true,
      price: "22.50",
      entitlements: [
        { serviceId: service.id, usageLimitPerCycle: 3 },
      ],
    }),
  )
  assert.equal(reactivated.active, true)
  assert.equal(reactivated.services[0]?.usageLimitPerCycle, 3)
})

test("STAFF cannot obtain Club mutation authorization", async () => {
  const shop = await createShop("staff-denied")
  const staff = await createIdentity(shop.id, "STAFF", "staff")

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

  assert.equal(
    await db.membershipPlan.count({ where: { barbershopId: shop.id } }),
    0,
  )
})

test("tenant-scoped Club helpers cannot read or write another tenant plan", async () => {
  const first = await createShop("scope-a")
  const second = await createShop("scope-b")
  const service = await createService(second.id, "B")
  const plan = await createMembershipPlan(
    second.id,
    planInput({
      entitlements: [
        { serviceId: service.id, usageLimitPerCycle: 1 },
      ],
    }),
  )

  assert.equal(await getMembershipPlan(first.id, plan.id), null)
  await expectClubCode(
    () =>
      updateMembershipPlan(
        first.id,
        plan.id,
        planInput({ name: "Cross tenant edit" }),
      ),
    "NOT_FOUND",
  )

  const still = await getMembershipPlan(second.id, plan.id)
  assert.equal(still?.name, "Club Flexível")
})

test("inactive Service cannot be newly attached", async () => {
  const shop = await createShop("inactive-new")
  const inactive = await createService(shop.id, "Inactive", false)

  await expectClubCode(
    () =>
      createMembershipPlan(
        shop.id,
        planInput({
          entitlements: [
            { serviceId: inactive.id, usageLimitPerCycle: 1 },
          ],
        }),
      ),
    "INVALID_ASSIGNMENT",
  )
  assert.equal(
    await db.membershipPlan.count({ where: { barbershopId: shop.id } }),
    0,
  )
})

test("an already-linked Service remains historical after Service deactivation", async () => {
  const shop = await createShop("inactive-existing")
  const service = await createService(shop.id, "Existing")
  const plan = await createMembershipPlan(
    shop.id,
    planInput({
      entitlements: [
        { serviceId: service.id, usageLimitPerCycle: 2 },
      ],
    }),
  )

  await db.service.update({
    where: { id: service.id },
    data: { active: false },
  })

  const updated = await updateMembershipPlan(
    shop.id,
    plan.id,
    planInput({
      name: "Still configured",
      entitlements: [
        { serviceId: service.id, usageLimitPerCycle: 4 },
      ],
    }),
  )

  assert.equal(updated.services.length, 1)
  assert.equal(updated.services[0]?.service.active, false)
  assert.equal(updated.services[0]?.usageLimitPerCycle, 4)
})

test("failed entitlement replacement leaves previous plan configuration intact", async () => {
  const first = await createShop("atomic-a")
  const second = await createShop("atomic-b")
  const originalService = await createService(first.id, "Original")
  const foreignService = await createService(second.id, "Foreign")
  const plan = await createMembershipPlan(
    first.id,
    planInput({
      name: "Original plan",
      price: "31.00",
      entitlements: [
        { serviceId: originalService.id, usageLimitPerCycle: 2 },
      ],
    }),
  )

  await expectClubCode(
    () =>
      updateMembershipPlan(
        first.id,
        plan.id,
        planInput({
          name: "Should not persist",
          price: "99.00",
          entitlements: [
            { serviceId: foreignService.id, usageLimitPerCycle: 1 },
          ],
        }),
      ),
    "INVALID_ASSIGNMENT",
  )

  const persisted = await getMembershipPlan(first.id, plan.id)
  assert.ok(persisted)
  assert.equal(persisted.name, "Original plan")
  assert.equal(persisted.price.toFixed(2), "31.00")
  assert.equal(persisted.services.length, 1)
  assert.equal(persisted.services[0]?.serviceId, originalService.id)
  assert.equal(persisted.services[0]?.usageLimitPerCycle, 2)
})

test("archive preserves plan entitlements and Services and cannot be reactivated", async () => {
  const shop = await createShop("archive-history")
  const first = await createService(shop.id, "First")
  const second = await createService(shop.id, "Second")
  const plan = await createMembershipPlan(
    shop.id,
    planInput({
      entitlements: [
        { serviceId: first.id, usageLimitPerCycle: 2 },
        { serviceId: second.id, usageLimitPerCycle: null },
      ],
    }),
  )

  const archived = await archiveMembershipPlan(shop.id, plan.id)
  assert.equal(archived.active, false)
  assert.ok(archived.archivedAt)
  assert.equal(archived.services.length, 2)

  assert.equal(
    await db.membershipPlan.count({ where: { id: plan.id } }),
    1,
  )
  assert.equal(
    await db.membershipPlanService.count({
      where: { membershipPlanId: plan.id },
    }),
    2,
  )
  assert.equal(
    await db.service.count({
      where: { id: { in: [first.id, second.id] } },
    }),
    2,
  )

  await expectClubCode(
    () =>
      updateMembershipPlan(
        shop.id,
        plan.id,
        planInput({ active: true }),
      ),
    "INVALID_LIFECYCLE",
  )
})

test("generic commercial model expresses arbitrary finite and unlimited Service combinations", async () => {
  const firstShop = await createShop("commercial-a")
  const corte = await createService(firstShop.id, "Corte")
  const retoque = await createService(firstShop.id, "Retoque / contornos")

  const planA = await createMembershipPlan(
    firstShop.id,
    planInput({
      name: "Plano A",
      price: "39.90",
      benefits: "Prioridade; texto comercial livre.",
      entitlements: [
        { serviceId: corte.id, usageLimitPerCycle: 2 },
        { serviceId: retoque.id, usageLimitPerCycle: null },
      ],
    }),
  )

  const secondShop = await createShop("commercial-b")
  const custom = await createService(secondShop.id, "Serviço definido pelo tenant")
  const planB = await createMembershipPlan(
    secondShop.id,
    planInput({
      name: "Plano B",
      price: "17.25",
      benefits: "Outro benefício livre.",
      entitlements: [
        { serviceId: custom.id, usageLimitPerCycle: 4 },
      ],
    }),
  )

  assert.equal(planA.price.toFixed(2), "39.90")
  assert.equal(planA.services[0]?.usageLimitPerCycle, 2)
  assert.equal(planA.services[1]?.usageLimitPerCycle, null)
  assert.equal(planB.price.toFixed(2), "17.25")
  assert.equal(planB.services[0]?.usageLimitPerCycle, 4)

  const source = readFileSync("lib/club-plans.ts", "utf8")
  assert.equal(source.includes("isRetouch"), false)
  assert.equal(source.includes("Retoque"), false)
  assert.equal(source.includes("Corte"), false)
})

test("benefits are plain stored data and Club UI does not execute arbitrary markup", async () => {
  const shop = await createShop("benefits")
  const benefits = "<script>alert('x')</script>\nPrioridade"
  const plan = await createMembershipPlan(
    shop.id,
    planInput({ benefits }),
  )
  assert.equal(plan.benefits, benefits)

  const page = readFileSync(
    "app/(admin)/admin/[slug]/club/page.tsx",
    "utf8",
  )
  assert.equal(page.includes("dangerouslySetInnerHTML"), false)
})

test("Club admin surface is autonomous and reuses canonical privilegedWrite authorization", () => {
  const actions = readFileSync(
    "app/(admin)/admin/[slug]/club/actions.ts",
    "utf8",
  )
  const page = readFileSync(
    "app/(admin)/admin/[slug]/club/page.tsx",
    "utf8",
  )
  const navigation = readFileSync(
    "app/(admin)/admin/[slug]/layout.tsx",
    "utf8",
  )

  assert.match(actions, /requireBarbershopBySlug\(rawSlug, \["OWNER", "ADMIN"\]\)/)
  assert.match(actions, /"privilegedWrite"/)
  assert.equal(actions.includes("barbershopId = form"), false)
  assert.match(page, /"OWNER",\s*"ADMIN",\s*"STAFF"/)
  assert.match(page, /membership\.role === "OWNER"/)
  assert.match(page, /membership\.role === "ADMIN"/)
  assert.match(page, /role STAFF permite consultar/)
  assert.match(navigation, /\/club/)
})

test("normal Club domain exposes no MembershipPlan hard-delete path", () => {
  const source = readFileSync("lib/club-plans.ts", "utf8")
  assert.equal(source.includes("membershipPlan.delete("), false)
  assert.equal(source.includes("membershipPlan.deleteMany("), false)
  assert.match(source, /archivedAt: new Date\(\)/)
  assert.match(source, /active: false/)
})

test("005A plan domain remains independent from membership lifecycle and billing", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8")
  const source = readFileSync("lib/club-plans.ts", "utf8")

  assert.match(schema, /model MembershipPlan\s*\{/)
  assert.match(schema, /model MembershipPlanService\s*\{/)
  assert.equal(source.includes("MembershipUsage"), false)
  assert.equal(source.includes("Payment"), false)
  assert.equal(source.includes("PlatformSubscription"), false)
  assert.equal(source.includes("enroll"), false)
  assert.equal(source.toLowerCase().includes("payment"), false)
})

test("Club plan list remains tenant-scoped", async () => {
  const first = await createShop("list-a")
  const second = await createShop("list-b")
  await createMembershipPlan(first.id, planInput({ name: "Only A" }))
  await createMembershipPlan(second.id, planInput({ name: "Only B" }))

  const plans = await getMembershipPlans(first.id)
  assert.deepEqual(plans.map((plan) => plan.name), ["Only A"])
})

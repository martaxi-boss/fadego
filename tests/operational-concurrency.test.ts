import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, test } from "node:test"
import type { PoolClient } from "pg"

type PrismaRuntime = typeof import("../lib/prisma")
type OperationalRuntime = typeof import("../lib/operational-config")

const databaseUrl = process.env.DATABASE_URL
assert.ok(databaseUrl, "DATABASE_URL is required for concurrency tests.")

const applicationName = `fadego-concurrency-${process.pid}`
const scopedDatabaseUrl = new URL(databaseUrl)
scopedDatabaseUrl.searchParams.set("application_name", applicationName)
process.env.DATABASE_URL = scopedDatabaseUrl.toString()

let prismaRuntime: PrismaRuntime | null = null
let operationalRuntime: OperationalRuntime | null = null
const createdShopIds: string[] = []

const requirePrismaRuntime = () => {
  assert.ok(prismaRuntime)
  return prismaRuntime
}

const requireOperationalRuntime = () => {
  assert.ok(operationalRuntime)
  return operationalRuntime
}

before(async () => {
  prismaRuntime = await import("../lib/prisma")
  operationalRuntime = await import("../lib/operational-config")
})

const createShopWithStaff = async (tag: string) => {
  const { db } = requirePrismaRuntime()
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10)
  const shop = await db.barbershop.create({
    data: {
      name: `Concurrency ${tag}`,
      slug: `concurrency-${tag}-${suffix}`,
    },
  })

  const staff = await db.staffMember.create({
    data: {
      barbershopId: shop.id,
      name: `Staff ${tag}`,
    },
  })

  createdShopIds.push(shop.id)
  return { shop, staff }
}

const expectOperationalCode = async (
  promise: Promise<unknown>,
  code: "INVALID_ASSIGNMENT" | "INVALID_LIFECYCLE",
) => {
  const { OperationalConfigError } = requireOperationalRuntime()

  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof OperationalConfigError)
    assert.equal(error.code, code)
    return true
  })
}

const waitForBlockedQuery = async (
  observer: PoolClient,
  queryFragment: string,
) => {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const result = await observer.query<{ blocked: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND pid <> pg_backend_pid()
            AND query LIKE $1
            AND wait_event_type = 'Lock'
        ) AS blocked
      `,
      [`%${queryFragment}%`],
    )

    if (result.rows[0]?.blocked) {
      return
    }

    await new Promise<void>((resolve) => setImmediate(resolve))
  }

  assert.fail(`Expected blocked PostgreSQL query containing: ${queryFragment}`)
}

after(async () => {
  const { db, getPool } = requirePrismaRuntime()

  if (createdShopIds.length > 0) {
    await db.chair.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.staffMember.deleteMany({
      where: { barbershopId: { in: createdShopIds } },
    })
    await db.barbershop.deleteMany({
      where: { id: { in: createdShopIds } },
    })
  }

  await db.$disconnect()
  await getPool().end()
})

test("deactivate first serial order rejects a later new STAFF_BOOKING assignment", async () => {
  const { getPool, db } = requirePrismaRuntime()
  const { createChairConfiguration } = requireOperationalRuntime()
  const { shop, staff } = await createShopWithStaff("deactivate-first")
  const lifecycleWriter = await getPool().connect()
  const observer = await getPool().connect()
  let transactionOpen = false

  try {
    await lifecycleWriter.query("BEGIN")
    transactionOpen = true
    await lifecycleWriter.query(
      `
        SELECT "id"
        FROM "StaffMember"
        WHERE "id" = $1 AND "barbershopId" = $2
        FOR UPDATE
      `,
      [staff.id, shop.id],
    )
    await lifecycleWriter.query(
      `
        UPDATE "StaffMember"
        SET "active" = false, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $1 AND "barbershopId" = $2
      `,
      [staff.id, shop.id],
    )

    const assignment = createChairConfiguration(shop.id, {
      number: 1,
      name: null,
      mode: "STAFF_BOOKING",
      staffMemberId: staff.id,
      active: true,
    })

    await waitForBlockedQuery(observer, "fadego:staff-assignment-lock")

    await lifecycleWriter.query("COMMIT")
    transactionOpen = false

    await expectOperationalCode(assignment, "INVALID_ASSIGNMENT")
    assert.equal(
      await db.chair.count({ where: { barbershopId: shop.id } }),
      0,
    )
  } finally {
    if (transactionOpen) {
      await lifecycleWriter.query("ROLLBACK")
    }
    lifecycleWriter.release()
    observer.release()
  }
})

test("assignment first serial order permits later deactivation and preserves the Chair link", async () => {
  const { getPool, db } = requirePrismaRuntime()
  const { createChairConfiguration, updateStaffMember } =
    requireOperationalRuntime()
  const { shop, staff } = await createShopWithStaff("assignment-first")
  const chairTableBlocker = await getPool().connect()
  const observer = await getPool().connect()
  let transactionOpen = false

  try {
    await chairTableBlocker.query("BEGIN")
    transactionOpen = true
    await chairTableBlocker.query(
      'LOCK TABLE "Chair" IN ACCESS EXCLUSIVE MODE',
    )

    const assignment = createChairConfiguration(shop.id, {
      number: 1,
      name: "Primary",
      mode: "STAFF_BOOKING",
      staffMemberId: staff.id,
      active: true,
    })

    await waitForBlockedQuery(observer, 'INSERT INTO "public"."Chair"')

    const deactivation = updateStaffMember(shop.id, staff.id, {
      name: staff.name,
      photoUrl: null,
      active: false,
      archived: false,
    })

    await waitForBlockedQuery(observer, "fadego:staff-lifecycle-lock")

    await chairTableBlocker.query("COMMIT")
    transactionOpen = false

    const [chair, updatedStaff] = await Promise.all([
      assignment,
      deactivation,
    ])

    assert.equal(updatedStaff.active, false)

    const preserved = await db.chair.findUnique({
      where: { id: chair.id },
    })
    assert.ok(preserved)
    assert.equal(preserved.mode, "STAFF_BOOKING")
    assert.equal(preserved.staffMemberId, staff.id)
  } finally {
    if (transactionOpen) {
      await chairTableBlocker.query("ROLLBACK")
    }
    chairTableBlocker.release()
    observer.release()
  }
})

test("stale lifecycle writer cannot reactivate or unarchive an already committed archive", async () => {
  const { getPool, db } = requirePrismaRuntime()
  const { updateStaffMember } = requireOperationalRuntime()
  const { shop, staff } = await createShopWithStaff("stale-lifecycle")
  const archiver = await getPool().connect()
  const observer = await getPool().connect()
  let transactionOpen = false

  try {
    await archiver.query("BEGIN")
    transactionOpen = true
    await archiver.query(
      `
        SELECT "id"
        FROM "StaffMember"
        WHERE "id" = $1 AND "barbershopId" = $2
        FOR UPDATE
      `,
      [staff.id, shop.id],
    )
    await archiver.query(
      `
        UPDATE "StaffMember"
        SET
          "active" = false,
          "archivedAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $1 AND "barbershopId" = $2
      `,
      [staff.id, shop.id],
    )

    const staleWriter = updateStaffMember(shop.id, staff.id, {
      name: "Stale writer",
      photoUrl: null,
      active: true,
      archived: false,
    })

    await waitForBlockedQuery(observer, "fadego:staff-lifecycle-lock")

    await archiver.query("COMMIT")
    transactionOpen = false

    await expectOperationalCode(staleWriter, "INVALID_LIFECYCLE")

    const authoritative = await db.staffMember.findUnique({
      where: {
        id_barbershopId: {
          id: staff.id,
          barbershopId: shop.id,
        },
      },
    })

    assert.ok(authoritative)
    assert.equal(authoritative.active, false)
    assert.ok(authoritative.archivedAt)
  } finally {
    if (transactionOpen) {
      await archiver.query("ROLLBACK")
    }
    archiver.release()
    observer.release()
  }
})

test("existing STAFF_BOOKING assignment remains linked after normal staff deactivation", async () => {
  const { db } = requirePrismaRuntime()
  const { createChairConfiguration, updateStaffMember } =
    requireOperationalRuntime()
  const { shop, staff } = await createShopWithStaff("existing-preservation")

  const chair = await createChairConfiguration(shop.id, {
    number: 1,
    name: null,
    mode: "STAFF_BOOKING",
    staffMemberId: staff.id,
    active: true,
  })

  await updateStaffMember(shop.id, staff.id, {
    name: staff.name,
    photoUrl: null,
    active: false,
    archived: false,
  })

  const preserved = await db.chair.findUnique({
    where: { id: chair.id },
  })

  assert.ok(preserved)
  assert.equal(preserved.mode, "STAFF_BOOKING")
  assert.equal(preserved.staffMemberId, staff.id)
})

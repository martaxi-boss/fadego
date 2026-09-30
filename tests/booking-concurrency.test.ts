import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, test } from "node:test"
import type { PoolClient } from "pg"

type PrismaRuntime = typeof import("../lib/prisma")
type BookingRuntime = typeof import("../lib/booking-engine")
type OperationalRuntime = typeof import("../lib/operational-config")

const databaseUrl = process.env.DATABASE_URL
assert.ok(databaseUrl, "DATABASE_URL is required for booking concurrency tests.")

const applicationName = `fadego-booking-race-${process.pid}`
const scopedDatabaseUrl = new URL(databaseUrl)
scopedDatabaseUrl.searchParams.set("application_name", applicationName)
process.env.DATABASE_URL = scopedDatabaseUrl.toString()

let prismaRuntime: PrismaRuntime | null = null
let bookingRuntime: BookingRuntime | null = null
let operationalRuntime: OperationalRuntime | null = null
const createdShopIds: string[] = []

const requirePrismaRuntime = () => {
  assert.ok(prismaRuntime)
  return prismaRuntime
}

const requireBookingRuntime = () => {
  assert.ok(bookingRuntime)
  return bookingRuntime
}

const requireOperationalRuntime = () => {
  assert.ok(operationalRuntime)
  return operationalRuntime
}

before(async () => {
  prismaRuntime = await import("../lib/prisma")
  bookingRuntime = await import("../lib/booking-engine")
  operationalRuntime = await import("../lib/operational-config")
})

const utc = (hour: number, minute = 0) =>
  new Date(
    `2030-01-07T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`,
  )

const createBase = async (tag: string) => {
  const { db } = requirePrismaRuntime()
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10)
  const shop = await db.barbershop.create({
    data: {
      name: `Race ${tag}`,
      slug: `race-${tag}-${suffix}`,
      timezone: "Europe/Lisbon",
    },
  })
  createdShopIds.push(shop.id)

  await db.openingHour.createMany({
    data: Array.from({ length: 7 }, (_, weekday) => ({
      barbershopId: shop.id,
      weekday,
      isClosed: false,
      opensAt: 8 * 60,
      closesAt: 20 * 60,
    })),
  })

  const customer = await db.customer.create({
    data: {
      barbershopId: shop.id,
      name: "Race Customer",
      phone: "+351922222222",
    },
  })

  const service = await db.service.create({
    data: {
      barbershopId: shop.id,
      name: "Race Service",
      price: "20.00",
      durationMinutes: 30,
      active: true,
    },
  })

  return { shop, customer, service }
}

const createGeneralChair = async (barbershopId: string, number = 1) => {
  const { db } = requirePrismaRuntime()
  return db.chair.create({
    data: {
      barbershopId,
      number,
      mode: "GENERAL_BOOKING",
      active: true,
    },
  })
}

const createStaffChair = async (barbershopId: string, number = 1) => {
  const { db } = requirePrismaRuntime()
  const staff = await db.staffMember.create({
    data: {
      barbershopId,
      name: "Race Staff",
      active: true,
    },
  })
  const chair = await db.chair.create({
    data: {
      barbershopId,
      number,
      mode: "STAFF_BOOKING",
      staffMemberId: staff.id,
      active: true,
    },
  })

  return { staff, chair }
}

const waitForAdvisoryWaiters = async (
  observer: PoolClient,
  minimum: number,
) => {
  for (let attempt = 0; attempt < 4000; attempt += 1) {
    const result = await observer.query<{ waiting: string }>(
      `
        SELECT COUNT(*)::text AS waiting
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND application_name = $1
          AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
          AND query LIKE '%pg_advisory_xact_lock%'
      `,
      [applicationName],
    )

    if (Number(result.rows[0]?.waiting ?? 0) >= minimum) {
      return
    }

    await new Promise<void>((resolve) => setImmediate(resolve))
  }

  assert.fail(`Expected at least ${minimum} advisory-lock waiters.`)
}

const runBlockedPair = async <A, B>(
  barbershopId: string,
  first: () => Promise<A>,
  second: () => Promise<B>,
) => {
  const { getPool } = requirePrismaRuntime()
  const blocker = await getPool().connect()
  const observer = await getPool().connect()
  let open = false

  try {
    await blocker.query("BEGIN")
    open = true
    await blocker.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [barbershopId],
    )

    const firstPromise = first()
    const secondPromise = second()

    await waitForAdvisoryWaiters(observer, 2)

    await blocker.query("COMMIT")
    open = false

    return Promise.allSettled([firstPromise, secondPromise])
  } finally {
    if (open) {
      await blocker.query("ROLLBACK")
    }
    blocker.release()
    observer.release()
  }
}

const activeOverlapCount = async (barbershopId: string) => {
  const { getPool } = requirePrismaRuntime()
  const result = await getPool().query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM "Booking" a
      JOIN "Booking" b
        ON a."barbershopId" = b."barbershopId"
       AND a."id" < b."id"
       AND a."chairId" = b."chairId"
       AND tstzrange(a."startsAt", a."endsAt", '[)') &&
           tstzrange(b."startsAt", b."endsAt", '[)')
      WHERE a."barbershopId" = $1
        AND a."status" IN ('CONFIRMED', 'NEEDS_REASSIGNMENT')
        AND b."status" IN ('CONFIRMED', 'NEEDS_REASSIGNMENT')
    `,
    [barbershopId],
  )

  return Number(result.rows[0]?.count ?? 0)
}

after(async () => {
  const { db, getPool } = requirePrismaRuntime()

  if (createdShopIds.length > 0) {
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
    await db.barbershop.deleteMany({
      where: { id: { in: createdShopIds } },
    })
  }

  await db.$disconnect()
  await getPool().end()
})

test("GENERAL capacity race permits exactly one booking for one free chair", async () => {
  const { createBooking } = requireBookingRuntime()
  const fixture = await createBase("general")
  await createGeneralChair(fixture.shop.id)

  const input = {
    barbershopId: fixture.shop.id,
    customerId: fixture.customer.id,
    serviceId: fixture.service.id,
    startsAt: utc(9),
  }

  const results = await runBlockedPair(
    fixture.shop.id,
    () => createBooking(input),
    () => createBooking(input),
  )

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  )
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  )
  assert.equal(
    await requirePrismaRuntime().db.booking.count({
      where: { barbershopId: fixture.shop.id },
    }),
    1,
  )
  assert.equal(await activeOverlapCount(fixture.shop.id), 0)
})

test("STAFF race permits exactly one booking for the same professional/time", async () => {
  const { createBooking } = requireBookingRuntime()
  const fixture = await createBase("staff")
  const { staff } = await createStaffChair(fixture.shop.id)

  const input = {
    barbershopId: fixture.shop.id,
    customerId: fixture.customer.id,
    serviceId: fixture.service.id,
    startsAt: utc(10),
    requestedStaffMemberId: staff.id,
  }

  const results = await runBlockedPair(
    fixture.shop.id,
    () => createBooking(input),
    () => createBooking(input),
  )

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  )
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  )
  assert.equal(await activeOverlapCount(fixture.shop.id), 0)
})

test("reschedule/create race produces one valid serial order without overlap", async () => {
  const { createBooking, rescheduleBooking } = requireBookingRuntime()
  const fixture = await createBase("reschedule-create")
  await createGeneralChair(fixture.shop.id)

  const original = await createBooking({
    barbershopId: fixture.shop.id,
    customerId: fixture.customer.id,
    serviceId: fixture.service.id,
    startsAt: utc(9),
  })

  const results = await runBlockedPair(
    fixture.shop.id,
    () => rescheduleBooking(fixture.shop.id, original.id, utc(10)),
    () =>
      createBooking({
        barbershopId: fixture.shop.id,
        customerId: fixture.customer.id,
        serviceId: fixture.service.id,
        startsAt: utc(10),
      }),
  )

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  )
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  )
  assert.equal(await activeOverlapCount(fixture.shop.id), 0)

  const persistedOriginal = await requirePrismaRuntime().db.booking.findUnique({
    where: { id: original.id },
  })
  assert.ok(persistedOriginal)
  assert.ok(
    persistedOriginal.startsAt.getTime() === utc(9).getTime() ||
      persistedOriginal.startsAt.getTime() === utc(10).getTime(),
  )
})

test("staff deactivation/create race cannot leave a confirmed booking on inactive staff", async () => {
  const { createBooking } = requireBookingRuntime()
  const { updateStaffMember } = requireOperationalRuntime()
  const fixture = await createBase("staff-deactivate")
  const { staff } = await createStaffChair(fixture.shop.id)

  const results = await runBlockedPair(
    fixture.shop.id,
    () =>
      createBooking({
        barbershopId: fixture.shop.id,
        customerId: fixture.customer.id,
        serviceId: fixture.service.id,
        startsAt: utc(11),
        requestedStaffMemberId: staff.id,
      }),
    () =>
      updateStaffMember(fixture.shop.id, staff.id, {
        name: staff.name,
        photoUrl: null,
        active: false,
        archived: false,
      }),
  )

  assert.equal(results[1]?.status, "fulfilled")

  const persistedStaff =
    await requirePrismaRuntime().db.staffMember.findUnique({
      where: { id: staff.id },
    })
  assert.equal(persistedStaff?.active, false)

  const bookings = await requirePrismaRuntime().db.booking.findMany({
    where: {
      barbershopId: fixture.shop.id,
      staffMemberId: staff.id,
    },
  })

  assert.ok(bookings.length === 0 || bookings.length === 1)
  if (bookings.length === 1) {
    assert.equal(bookings[0]?.status, "NEEDS_REASSIGNMENT")
  }

  assert.equal(
    await requirePrismaRuntime().db.booking.count({
      where: {
        barbershopId: fixture.shop.id,
        staffMemberId: staff.id,
        status: "CONFIRMED",
      },
    }),
    0,
  )
  assert.equal(await activeOverlapCount(fixture.shop.id), 0)
})

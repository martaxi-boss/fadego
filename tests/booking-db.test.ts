import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, test } from "node:test"
import { db, getPool } from "../lib/prisma"

const createdShopIds: string[] = []

const utc = (hour: number, minute = 0) =>
  new Date(
    `2030-01-07T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`,
  )

const createFixture = async (tag: string) => {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10)
  const shop = await db.barbershop.create({
    data: {
      name: `DB ${tag}`,
      slug: `db-booking-${tag}-${suffix}`,
      timezone: "Europe/Lisbon",
    },
  })
  createdShopIds.push(shop.id)

  const customer = await db.customer.create({
    data: {
      barbershopId: shop.id,
      name: "DB Customer",
      phone: "+351933333333",
    },
  })
  const service = await db.service.create({
    data: {
      barbershopId: shop.id,
      name: "DB Service",
      price: "15.00",
      durationMinutes: 30,
    },
  })
  const general = await db.chair.create({
    data: {
      barbershopId: shop.id,
      number: 1,
      mode: "GENERAL_BOOKING",
    },
  })
  const staff = await db.staffMember.create({
    data: {
      barbershopId: shop.id,
      name: "DB Staff",
    },
  })
  const staffChair = await db.chair.create({
    data: {
      barbershopId: shop.id,
      number: 2,
      mode: "STAFF_BOOKING",
      staffMemberId: staff.id,
    },
  })

  return { shop, customer, service, general, staff, staffChair }
}

const generalData = (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  startsAt = utc(9),
  endsAt = utc(9, 30),
) => ({
  barbershopId: fixture.shop.id,
  customerId: fixture.customer.id,
  serviceId: fixture.service.id,
  chairId: fixture.general.id,
  staffMemberId: null,
  mode: "GENERAL_BOOKING" as const,
  startsAt,
  endsAt,
  status: "CONFIRMED" as const,
  serviceNameSnapshot: fixture.service.name,
  serviceDurationMinutes: 30,
  servicePriceSnapshot: fixture.service.price,
  customerNameSnapshot: fixture.customer.name,
  customerPhoneSnapshot: fixture.customer.phone,
  customerEmailSnapshot: fixture.customer.email,
  staffNameSnapshot: null,
  chairNumberSnapshot: fixture.general.number,
})

after(async () => {
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

test("PostgreSQL rejects non-positive Booking interval", async () => {
  const fixture = await createFixture("interval")
  await assert.rejects(() =>
    db.booking.create({
      data: generalData(fixture, utc(9), utc(9)),
    }),
  )
})

test("PostgreSQL rejects invalid duration snapshot grid", async () => {
  const fixture = await createFixture("duration-grid")
  const data = generalData(fixture)

  await assert.rejects(() =>
    db.booking.create({
      data: {
        ...data,
        serviceDurationMinutes: 20,
        endsAt: new Date(data.startsAt.getTime() + 20 * 60 * 1000),
      },
    }),
  )
})

test("PostgreSQL rejects interval that does not match duration snapshot", async () => {
  const fixture = await createFixture("duration-match")
  await assert.rejects(() =>
    db.booking.create({
      data: {
        ...generalData(fixture),
        endsAt: utc(9, 45),
      },
    }),
  )
})

test("PostgreSQL enforces Booking mode and staff shape", async () => {
  const fixture = await createFixture("mode-shape")
  const general = generalData(fixture)

  await assert.rejects(() =>
    db.booking.create({
      data: {
        ...general,
        mode: "STAFF_BOOKING",
      },
    }),
  )

  await assert.rejects(() =>
    db.booking.create({
      data: {
        ...general,
        staffMemberId: fixture.staff.id,
        staffNameSnapshot: fixture.staff.name,
      },
    }),
  )
})

test("Chair exclusion constraint rejects active half-open overlap and permits adjacency", async () => {
  const fixture = await createFixture("chair-exclusion")
  await db.booking.create({ data: generalData(fixture, utc(9), utc(9, 30)) })

  await assert.rejects(() =>
    db.booking.create({
      data: generalData(fixture, utc(9, 15), utc(9, 45)),
    }),
  )

  const adjacent = await db.booking.create({
    data: generalData(fixture, utc(9, 30), utc(10)),
  })
  assert.equal(adjacent.startsAt.getTime(), utc(9, 30).getTime())
})

test("Staff exclusion constraint rejects overlap across different chairs", async () => {
  const fixture = await createFixture("staff-exclusion")
  const secondChair = await db.chair.create({
    data: {
      barbershopId: fixture.shop.id,
      number: 3,
      mode: "STAFF_BOOKING",
      staffMemberId: fixture.staff.id,
    },
  })

  const base = {
    barbershopId: fixture.shop.id,
    customerId: fixture.customer.id,
    serviceId: fixture.service.id,
    staffMemberId: fixture.staff.id,
    mode: "STAFF_BOOKING" as const,
    startsAt: utc(11),
    endsAt: utc(11, 30),
    status: "CONFIRMED" as const,
    serviceNameSnapshot: fixture.service.name,
    serviceDurationMinutes: 30,
    servicePriceSnapshot: fixture.service.price,
    customerNameSnapshot: fixture.customer.name,
    customerPhoneSnapshot: fixture.customer.phone,
    customerEmailSnapshot: fixture.customer.email,
    staffNameSnapshot: fixture.staff.name,
  }

  await db.booking.create({
    data: {
      ...base,
      chairId: fixture.staffChair.id,
      chairNumberSnapshot: fixture.staffChair.number,
    },
  })

  await assert.rejects(() =>
    db.booking.create({
      data: {
        ...base,
        chairId: secondChair.id,
        chairNumberSnapshot: secondChair.number,
      },
    }),
  )
})

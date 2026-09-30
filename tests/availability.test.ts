import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, test } from "node:test"
import {
  AvailabilityError,
  getAvailability,
  type AvailabilityClock,
} from "../lib/availability"
import {
  BookingEngineError,
  createBooking,
  rescheduleBooking,
  type BookingClock,
} from "../lib/booking-engine"
import { db, getPool } from "../lib/prisma"

const createdShopIds: string[] = []
const earlyClock: AvailabilityClock = {
  now: () => new Date("2029-01-01T00:00:00.000Z"),
}
const earlyBookingClock: BookingClock = {
  now: () => new Date("2029-01-01T00:00:00.000Z"),
}

const weekdayOf = (localDate: string) => {
  const date = new Date(`${localDate}T00:00:00.000Z`)
  return (date.getUTCDay() + 6) % 7
}

const createFixture = async (
  tag: string,
  options?: {
    timezone?: string | null
    localDate?: string
    opensAt?: number
    closesAt?: number
    durationMinutes?: number
    serviceActive?: boolean
    createOpening?: boolean
    status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED"
  },
) => {
  const localDate = options?.localDate ?? "2030-01-07"
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10)
  const shop = await db.barbershop.create({
    data: {
      name: `Availability ${tag}`,
      slug: `availability-${tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}`,
      timezone:
        options && "timezone" in options ? options.timezone : "UTC",
      status: options?.status ?? "ACTIVE",
    },
  })
  createdShopIds.push(shop.id)

  if (options?.createOpening !== false) {
    await db.openingHour.create({
      data: {
        barbershopId: shop.id,
        weekday: weekdayOf(localDate),
        isClosed: false,
        opensAt: options?.opensAt ?? 9 * 60,
        closesAt: options?.closesAt ?? 11 * 60,
      },
    })
  }

  const customer = await db.customer.create({
    data: {
      barbershopId: shop.id,
      name: `Customer ${tag}`,
      phone: "+351944444444",
      email: `${tag.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@example.test`,
    },
  })

  const service = await db.service.create({
    data: {
      barbershopId: shop.id,
      name: `Service ${tag}`,
      price: "20.00",
      durationMinutes: options?.durationMinutes ?? 45,
      active: options?.serviceActive ?? true,
    },
  })

  return { shop, customer, service, localDate }
}

const addGeneralChair = async (
  barbershopId: string,
  number: number,
  active = true,
) =>
  db.chair.create({
    data: {
      barbershopId,
      number,
      mode: "GENERAL_BOOKING",
      active,
    },
  })

const addWalkInChair = async (barbershopId: string, number: number) =>
  db.chair.create({
    data: {
      barbershopId,
      number,
      mode: "WALK_IN",
      active: true,
    },
  })

const addStaff = async (
  barbershopId: string,
  name: string,
  number: number,
  options?: {
    active?: boolean
    archived?: boolean
    chairActive?: boolean
    createChair?: boolean
  },
) => {
  const archived = options?.archived ?? false
  const staff = await db.staffMember.create({
    data: {
      barbershopId,
      name,
      active: archived ? false : (options?.active ?? true),
      archivedAt: archived ? new Date() : null,
    },
  })

  const chair =
    options?.createChair === false
      ? null
      : await db.chair.create({
          data: {
            barbershopId,
            number,
            mode: "STAFF_BOOKING",
            staffMemberId: staff.id,
            active: options?.chairActive ?? true,
          },
        })

  return { staff, chair }
}

const queryAvailability = (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  requestedStaffMemberId?: string,
  clock: AvailabilityClock = earlyClock,
) =>
  getAvailability(
    {
      barbershopId: fixture.shop.id,
      serviceId: fixture.service.id,
      localDate: fixture.localDate,
      requestedStaffMemberId,
    },
    { clock },
  )

const createBlockingBooking = async (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  chair: { id: string; number: number },
  startsAt: Date,
  options?: {
    durationMinutes?: number
    status?:
      | "CONFIRMED"
      | "NEEDS_REASSIGNMENT"
      | "CANCELLED_BY_CUSTOMER"
      | "CANCELLED_BY_SHOP"
      | "COMPLETED"
      | "NO_SHOW"
    staff?: { id: string; name: string } | null
  },
) => {
  const durationMinutes =
    options?.durationMinutes ?? fixture.service.durationMinutes
  const staff = options?.staff ?? null

  return db.booking.create({
    data: {
      barbershopId: fixture.shop.id,
      customerId: fixture.customer.id,
      serviceId: fixture.service.id,
      chairId: chair.id,
      staffMemberId: staff?.id ?? null,
      mode: staff ? "STAFF_BOOKING" : "GENERAL_BOOKING",
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMinutes * 60 * 1000),
      status: options?.status ?? "CONFIRMED",
      serviceNameSnapshot: fixture.service.name,
      serviceDurationMinutes: durationMinutes,
      servicePriceSnapshot: fixture.service.price,
      customerNameSnapshot: fixture.customer.name,
      customerPhoneSnapshot: fixture.customer.phone,
      customerEmailSnapshot: fixture.customer.email,
      staffNameSnapshot: staff?.name ?? null,
      chairNumberSnapshot: chair.number,
    },
  })
}

const expectAvailabilityCode = async (
  action: () => Promise<unknown>,
  code:
    | "TENANT_UNAVAILABLE"
    | "TIMEZONE_UNAVAILABLE"
    | "SERVICE_UNAVAILABLE"
    | "INVALID_LOCAL_DATE",
) => {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof AvailabilityError)
    assert.equal(error.code, code)
    return true
  })
}

const expectBookingCode = async (
  action: () => Promise<unknown>,
  code: "PAST_START" | "NO_CAPACITY",
) => {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof BookingEngineError)
    assert.equal(error.code, code)
    return true
  })
}

const slotTimes = (result: Awaited<ReturnType<typeof getAvailability>>) =>
  result.slots.map((slot) => slot.localTime)

const localRoundTrip = (value: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value)
  const byType = new Map(parts.map((part) => [part.type, part.value]))
  return {
    date: `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`,
    time: `${byType.get("hour")}:${byType.get("minute")}`,
  }
}

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

test("closed day returns zero slots", async () => {
  const fixture = await createFixture("closed")
  await addGeneralChair(fixture.shop.id, 1)
  await db.openingHour.update({
    where: {
      barbershopId_weekday: {
        barbershopId: fixture.shop.id,
        weekday: weekdayOf(fixture.localDate),
      },
    },
    data: { isClosed: true, opensAt: null, closesAt: null },
  })

  const result = await queryAvailability(fixture)
  assert.deepEqual(result.slots, [])
})

test("missing OpeningHour returns zero slots", async () => {
  const fixture = await createFixture("missing-hours", {
    createOpening: false,
  })
  await addGeneralChair(fixture.shop.id, 1)

  const result = await queryAvailability(fixture)
  assert.deepEqual(result.slots, [])
})

test("15-minute service generates canonical starts", async () => {
  const fixture = await createFixture("duration-15", {
    durationMinutes: 15,
    closesAt: 10 * 60,
  })
  await addGeneralChair(fixture.shop.id, 1)

  assert.deepEqual(slotTimes(await queryAvailability(fixture)), [
    "09:00",
    "09:15",
    "09:30",
    "09:45",
  ])
})

test("30-minute service generates canonical starts", async () => {
  const fixture = await createFixture("duration-30", {
    durationMinutes: 30,
    closesAt: 10 * 60,
  })
  await addGeneralChair(fixture.shop.id, 1)

  assert.deepEqual(slotTimes(await queryAvailability(fixture)), [
    "09:00",
    "09:15",
    "09:30",
  ])
})

test("45-minute service implements the 09:00-11:00 example", async () => {
  const fixture = await createFixture("duration-45", {
    durationMinutes: 45,
  })
  await addGeneralChair(fixture.shop.id, 1)

  assert.deepEqual(slotTimes(await queryAvailability(fixture)), [
    "09:00",
    "09:15",
    "09:30",
    "09:45",
    "10:00",
    "10:15",
  ])
})

test("60-minute service generates only fully fitting starts", async () => {
  const fixture = await createFixture("duration-60", {
    durationMinutes: 60,
  })
  await addGeneralChair(fixture.shop.id, 1)

  assert.deepEqual(slotTimes(await queryAvailability(fixture)), [
    "09:00",
    "09:15",
    "09:30",
    "09:45",
    "10:00",
  ])
})

test("slot ending exactly at closing is included", async () => {
  const fixture = await createFixture("close-exact", {
    durationMinutes: 30,
    closesAt: 10 * 60,
  })
  await addGeneralChair(fixture.shop.id, 1)

  const result = await queryAvailability(fixture)
  const exact = result.slots.find((slot) => slot.localTime === "09:30")
  assert.ok(exact)
  assert.equal(exact.endsAt.toISOString(), "2030-01-07T10:00:00.000Z")
  assert.equal(result.slots.some((slot) => slot.localTime === "09:45"), false)
})

test("non-grid opening rounds forward to next 15-minute start", async () => {
  const fixture = await createFixture("non-grid-open", {
    durationMinutes: 30,
    opensAt: 9 * 60 + 5,
    closesAt: 10 * 60,
  })
  await addGeneralChair(fixture.shop.id, 1)

  const result = await queryAvailability(fixture)
  assert.equal(result.slots[0]?.localTime, "09:15")
})

test("inactive Service is rejected safely", async () => {
  const fixture = await createFixture("inactive-service", {
    serviceActive: false,
  })
  await addGeneralChair(fixture.shop.id, 1)

  await expectAvailabilityCode(
    () => queryAvailability(fixture),
    "SERVICE_UNAVAILABLE",
  )
})

test("SUSPENDED tenant is unavailable", async () => {
  const fixture = await createFixture("suspended", {
    status: "SUSPENDED",
  })
  await addGeneralChair(fixture.shop.id, 1)

  await expectAvailabilityCode(
    () => queryAvailability(fixture),
    "TENANT_UNAVAILABLE",
  )
})

test("missing and invalid timezones are rejected safely", async () => {
  const missing = await createFixture("timezone-missing", {
    timezone: null,
  })
  await addGeneralChair(missing.shop.id, 1)
  await expectAvailabilityCode(
    () => queryAvailability(missing),
    "TIMEZONE_UNAVAILABLE",
  )

  const invalid = await createFixture("timezone-invalid", {
    timezone: "Not/A_Zone",
  })
  await addGeneralChair(invalid.shop.id, 1)
  await expectAvailabilityCode(
    () => queryAvailability(invalid),
    "TIMEZONE_UNAVAILABLE",
  )
})

test("malformed and impossible local dates are rejected", async () => {
  const fixture = await createFixture("bad-date")
  await addGeneralChair(fixture.shop.id, 1)

  await expectAvailabilityCode(
    () =>
      getAvailability(
        {
          barbershopId: fixture.shop.id,
          serviceId: fixture.service.id,
          localDate: "2030-1-07",
        },
        { clock: earlyClock },
      ),
    "INVALID_LOCAL_DATE",
  )

  await expectAvailabilityCode(
    () =>
      getAvailability(
        {
          barbershopId: fixture.shop.id,
          serviceId: fixture.service.id,
          localDate: "2030-02-30",
        },
        { clock: earlyClock },
      ),
    "INVALID_LOCAL_DATE",
  )
})

test("slot output is chronological and deterministic", async () => {
  const fixture = await createFixture("ordered", {
    durationMinutes: 15,
  })
  await addGeneralChair(fixture.shop.id, 1)

  const result = await queryAvailability(fixture)
  const millis = result.slots.map((slot) => slot.startsAt.getTime())
  assert.deepEqual(millis, [...millis].sort((a, b) => a - b))
  assert.equal(new Set(slotTimes(result)).size, result.slots.length)
})

test("one GENERAL Chair reports capacity 1", async () => {
  const fixture = await createFixture("capacity-one")
  await addGeneralChair(fixture.shop.id, 1)

  const result = await queryAvailability(fixture)
  assert.ok(result.slots.length > 0)
  assert.ok(result.slots.every((slot) => slot.availableCapacity === 1))
  assert.equal("chairId" in result.slots[0]!, false)
})

test("three GENERAL Chairs report capacity 3", async () => {
  const fixture = await createFixture("capacity-three")
  await Promise.all([
    addGeneralChair(fixture.shop.id, 1),
    addGeneralChair(fixture.shop.id, 2),
    addGeneralChair(fixture.shop.id, 3),
  ])

  const result = await queryAvailability(fixture)
  assert.equal(result.slots.find((slot) => slot.localTime === "10:00")?.availableCapacity, 3)
})

test("partial GENERAL occupation reports remaining capacity", async () => {
  const fixture = await createFixture("capacity-partial")
  const chairs = await Promise.all([
    addGeneralChair(fixture.shop.id, 1),
    addGeneralChair(fixture.shop.id, 2),
    addGeneralChair(fixture.shop.id, 3),
  ])

  await createBlockingBooking(
    fixture,
    chairs[0]!,
    new Date("2030-01-07T10:00:00.000Z"),
  )
  await createBlockingBooking(
    fixture,
    chairs[1]!,
    new Date("2030-01-07T10:00:00.000Z"),
  )

  const result = await queryAvailability(fixture)
  assert.equal(result.slots.find((slot) => slot.localTime === "10:00")?.availableCapacity, 1)
})

test("all GENERAL resources occupied removes the slot", async () => {
  const fixture = await createFixture("capacity-none")
  const chairs = await Promise.all([
    addGeneralChair(fixture.shop.id, 1),
    addGeneralChair(fixture.shop.id, 2),
    addGeneralChair(fixture.shop.id, 3),
  ])

  for (const chair of chairs) {
    await createBlockingBooking(
      fixture,
      chair,
      new Date("2030-01-07T10:00:00.000Z"),
    )
  }

  const result = await queryAvailability(fixture)
  assert.equal(result.slots.some((slot) => slot.localTime === "10:00"), false)
})

test("WALK_IN, STAFF_BOOKING and inactive Chairs do not add general capacity", async () => {
  const fixture = await createFixture("general-resource-filter")
  await addGeneralChair(fixture.shop.id, 1)
  await addGeneralChair(fixture.shop.id, 2, false)
  await addWalkInChair(fixture.shop.id, 3)
  await addStaff(fixture.shop.id, "Staff", 4)

  const result = await queryAvailability(fixture)
  assert.ok(result.slots.every((slot) => slot.availableCapacity === 1))
})

test("cancelled Booking releases a previously blocked slot", async () => {
  const fixture = await createFixture("cancel-release")
  const chair = await addGeneralChair(fixture.shop.id, 1)
  const booking = await createBlockingBooking(
    fixture,
    chair,
    new Date("2030-01-07T10:00:00.000Z"),
  )

  const blocked = await queryAvailability(fixture)
  assert.equal(blocked.slots.some((slot) => slot.localTime === "10:00"), false)

  await db.booking.update({
    where: { id: booking.id },
    data: { status: "CANCELLED_BY_CUSTOMER" },
  })

  const released = await queryAvailability(fixture)
  assert.equal(released.slots.some((slot) => slot.localTime === "10:00"), true)
})

test("NEEDS_REASSIGNMENT continues blocking its concrete Chair", async () => {
  const fixture = await createFixture("needs-block")
  const chair = await addGeneralChair(fixture.shop.id, 1)
  await createBlockingBooking(
    fixture,
    chair,
    new Date("2030-01-07T10:00:00.000Z"),
    { status: "NEEDS_REASSIGNMENT" },
  )

  const result = await queryAvailability(fixture)
  assert.equal(result.slots.some((slot) => slot.localTime === "10:00"), false)
})

test("active professional with an eligible Chair exposes capacity 1 slots", async () => {
  const fixture = await createFixture("staff-active")
  const { staff } = await addStaff(fixture.shop.id, "Active", 1)

  const result = await queryAvailability(fixture, staff.id)
  assert.equal(result.mode, "STAFF_BOOKING")
  assert.ok(result.slots.length > 0)
  assert.ok(result.slots.every((slot) => slot.availableCapacity === 1))
})

test("inactive and archived professionals expose no slots", async () => {
  const inactiveFixture = await createFixture("staff-inactive")
  const inactive = await addStaff(inactiveFixture.shop.id, "Inactive", 1, {
    active: false,
  })
  assert.deepEqual(
    (await queryAvailability(inactiveFixture, inactive.staff.id)).slots,
    [],
  )

  const archivedFixture = await createFixture("staff-archived")
  const archived = await addStaff(archivedFixture.shop.id, "Archived", 1, {
    archived: true,
  })
  assert.deepEqual(
    (await queryAvailability(archivedFixture, archived.staff.id)).slots,
    [],
  )
})

test("professional with no active STAFF_BOOKING Chair exposes no slots", async () => {
  const fixture = await createFixture("staff-no-chair")
  const { staff } = await addStaff(fixture.shop.id, "No chair", 1, {
    createChair: false,
  })

  assert.deepEqual((await queryAvailability(fixture, staff.id)).slots, [])
})

test("professional overlap hides a candidate even when another associated Chair is free", async () => {
  const fixture = await createFixture("staff-overlap")
  const { staff, chair } = await addStaff(fixture.shop.id, "Busy", 1)
  assert.ok(chair)
  await db.chair.create({
    data: {
      barbershopId: fixture.shop.id,
      number: 2,
      mode: "STAFF_BOOKING",
      staffMemberId: staff.id,
      active: true,
    },
  })
  await createBlockingBooking(
    fixture,
    chair,
    new Date("2030-01-07T10:00:00.000Z"),
    { staff },
  )

  const result = await queryAvailability(fixture, staff.id)
  assert.equal(result.slots.some((slot) => slot.localTime === "10:00"), false)
})

test("Chair overlap hides candidate for a professional with no other eligible Chair", async () => {
  const fixture = await createFixture("staff-chair-overlap")
  const { staff, chair } = await addStaff(fixture.shop.id, "Chair busy", 1)
  assert.ok(chair)
  await createBlockingBooking(
    fixture,
    chair,
    new Date("2030-01-07T10:00:00.000Z"),
  )

  const result = await queryAvailability(fixture, staff.id)
  assert.equal(result.slots.some((slot) => slot.localTime === "10:00"), false)
})

test("two Chairs assigned to one professional never produce capacity 2", async () => {
  const fixture = await createFixture("staff-two-chairs")
  const { staff } = await addStaff(fixture.shop.id, "One person", 1)
  await db.chair.create({
    data: {
      barbershopId: fixture.shop.id,
      number: 2,
      mode: "STAFF_BOOKING",
      staffMemberId: staff.id,
      active: true,
    },
  })

  const result = await queryAvailability(fixture, staff.id)
  assert.ok(result.slots.length > 0)
  assert.ok(result.slots.every((slot) => slot.availableCapacity === 1))
})

test("shop timezone, not server timezone, determines an absolute slot", async () => {
  const fixture = await createFixture("timezone-auckland", {
    timezone: "Pacific/Auckland",
    durationMinutes: 30,
    opensAt: 9 * 60,
    closesAt: 10 * 60,
  })
  await addGeneralChair(fixture.shop.id, 1)

  const result = await queryAvailability(fixture)
  const first = result.slots[0]
  assert.ok(first)
  assert.equal(first.localTime, "09:00")
  assert.equal(first.startsAt.toISOString(), "2030-01-06T20:00:00.000Z")
  assert.deepEqual(localRoundTrip(first.startsAt, result.timezone), {
    date: fixture.localDate,
    time: "09:00",
  })
})

test("shop-local date may map to the next UTC calendar date", async () => {
  const fixture = await createFixture("timezone-honolulu", {
    timezone: "Pacific/Honolulu",
    durationMinutes: 30,
    opensAt: 20 * 60,
    closesAt: 21 * 60,
  })
  await addGeneralChair(fixture.shop.id, 1)

  const result = await queryAvailability(fixture)
  const first = result.slots[0]
  assert.ok(first)
  assert.equal(first.localTime, "20:00")
  assert.equal(first.startsAt.toISOString(), "2030-01-08T06:00:00.000Z")
})

test("spring-forward nonexistent wall-clock starts are omitted", async () => {
  const fixture = await createFixture("dst-spring", {
    timezone: "America/New_York",
    localDate: "2030-03-10",
    durationMinutes: 15,
    opensAt: 60,
    closesAt: 4 * 60,
  })
  await addGeneralChair(fixture.shop.id, 1)

  const result = await queryAvailability(fixture)
  for (const missing of ["02:00", "02:15", "02:30", "02:45"]) {
    assert.equal(result.slots.some((slot) => slot.localTime === missing), false)
  }
  assert.equal(result.slots.some((slot) => slot.localTime === "01:45"), true)
  assert.equal(result.slots.some((slot) => slot.localTime === "03:00"), true)
})

test("fall-back ambiguous repeated starts are conservatively omitted", async () => {
  const fixture = await createFixture("dst-fall", {
    timezone: "America/New_York",
    localDate: "2030-11-03",
    durationMinutes: 15,
    opensAt: 0,
    closesAt: 3 * 60,
  })
  await addGeneralChair(fixture.shop.id, 1)

  const result = await queryAvailability(fixture)
  for (const ambiguous of ["01:00", "01:15", "01:30", "01:45"]) {
    assert.equal(result.slots.some((slot) => slot.localTime === ambiguous), false)
  }
  assert.equal(new Set(slotTimes(result)).size, result.slots.length)
})

test("past local date exposes zero slots with deterministic clock", async () => {
  const fixture = await createFixture("past-date", {
    localDate: "2030-01-06",
  })
  await addGeneralChair(fixture.shop.id, 1)
  const clock: AvailabilityClock = {
    now: () => new Date("2030-01-07T12:00:00.000Z"),
  }

  assert.deepEqual((await queryAvailability(fixture, undefined, clock)).slots, [])
})

test("elapsed starts on current local day are omitted while future starts remain", async () => {
  const fixture = await createFixture("current-day", {
    durationMinutes: 30,
    opensAt: 9 * 60,
    closesAt: 14 * 60,
  })
  await addGeneralChair(fixture.shop.id, 1)
  const clock: AvailabilityClock = {
    now: () => new Date("2030-01-07T10:07:00.000Z"),
  }

  const result = await queryAvailability(fixture, undefined, clock)
  assert.equal(result.slots[0]?.localTime, "10:15")
  assert.equal(result.slots.some((slot) => slot.localTime === "10:00"), false)
  assert.equal(result.slots.some((slot) => slot.localTime === "11:00"), true)
})

test("future local dates behave normally", async () => {
  const fixture = await createFixture("future-date", {
    localDate: "2030-01-08",
  })
  await addGeneralChair(fixture.shop.id, 1)
  const clock: AvailabilityClock = {
    now: () => new Date("2030-01-07T12:00:00.000Z"),
  }

  assert.ok((await queryAvailability(fixture, undefined, clock)).slots.length > 0)
})

test("direct createBooking rejects a past start using deterministic clock", async () => {
  const fixture = await createFixture("past-create", {
    durationMinutes: 30,
    opensAt: 8 * 60,
    closesAt: 14 * 60,
  })
  await addGeneralChair(fixture.shop.id, 1)
  const clock: BookingClock = {
    now: () => new Date("2030-01-07T12:00:00.000Z"),
  }

  await expectBookingCode(
    () =>
      createBooking(
        {
          barbershopId: fixture.shop.id,
          customerId: fixture.customer.id,
          serviceId: fixture.service.id,
          startsAt: new Date("2030-01-07T11:00:00.000Z"),
        },
        clock,
      ),
    "PAST_START",
  )
})

test("direct rescheduleBooking rejects movement into the past", async () => {
  const fixture = await createFixture("past-reschedule", {
    durationMinutes: 30,
    opensAt: 8 * 60,
    closesAt: 15 * 60,
  })
  await addGeneralChair(fixture.shop.id, 1)
  const clock: BookingClock = {
    now: () => new Date("2030-01-07T12:00:00.000Z"),
  }
  const booking = await createBooking(
    {
      barbershopId: fixture.shop.id,
      customerId: fixture.customer.id,
      serviceId: fixture.service.id,
      startsAt: new Date("2030-01-07T13:00:00.000Z"),
    },
    clock,
  )

  await expectBookingCode(
    () =>
      rescheduleBooking(
        fixture.shop.id,
        booking.id,
        new Date("2030-01-07T11:00:00.000Z"),
        clock,
      ),
    "PAST_START",
  )
})

test("stale availability never guarantees final booking capacity", async () => {
  const fixture = await createFixture("stale-view", {
    durationMinutes: 45,
  })
  await addGeneralChair(fixture.shop.id, 1)
  const observed = await queryAvailability(fixture)
  const slot = observed.slots.find((candidate) => candidate.localTime === "10:00")
  assert.ok(slot)

  await createBooking(
    {
      barbershopId: fixture.shop.id,
      customerId: fixture.customer.id,
      serviceId: fixture.service.id,
      startsAt: slot.startsAt,
    },
    earlyBookingClock,
  )

  await expectBookingCode(
    () =>
      createBooking(
        {
          barbershopId: fixture.shop.id,
          customerId: fixture.customer.id,
          serviceId: fixture.service.id,
          startsAt: slot.startsAt,
        },
        earlyBookingClock,
      ),
    "NO_CAPACITY",
  )

  assert.equal(
    await db.booking.count({
      where: {
        barbershopId: fixture.shop.id,
        status: { in: ["CONFIRMED", "NEEDS_REASSIGNMENT"] },
      },
    }),
    1,
  )
})

test("tenant A Booking never reduces tenant B availability", async () => {
  const first = await createFixture("tenant-a")
  const second = await createFixture("tenant-b")
  const firstChair = await addGeneralChair(first.shop.id, 1)
  await addGeneralChair(second.shop.id, 1)

  await createBlockingBooking(
    first,
    firstChair,
    new Date("2030-01-07T10:00:00.000Z"),
  )

  const firstResult = await queryAvailability(first)
  const secondResult = await queryAvailability(second)
  assert.equal(firstResult.slots.some((slot) => slot.localTime === "10:00"), false)
  assert.equal(secondResult.slots.find((slot) => slot.localTime === "10:00")?.availableCapacity, 1)
})

test("foreign Service cannot enumerate tenant availability", async () => {
  const first = await createFixture("foreign-service-a")
  const second = await createFixture("foreign-service-b")
  await addGeneralChair(first.shop.id, 1)

  await expectAvailabilityCode(
    () =>
      getAvailability(
        {
          barbershopId: first.shop.id,
          serviceId: second.service.id,
          localDate: first.localDate,
        },
        { clock: earlyClock },
      ),
    "SERVICE_UNAVAILABLE",
  )
})

test("foreign StaffMember cannot contribute professional availability", async () => {
  const first = await createFixture("foreign-staff-a")
  const second = await createFixture("foreign-staff-b")
  await addGeneralChair(first.shop.id, 1)
  const foreign = await addStaff(second.shop.id, "Foreign", 1)

  const result = await queryAvailability(first, foreign.staff.id)
  assert.deepEqual(result.slots, [])
})

test("foreign resources never contribute general capacity", async () => {
  const first = await createFixture("foreign-resource-a")
  const second = await createFixture("foreign-resource-b")
  await addGeneralChair(second.shop.id, 1)

  assert.deepEqual((await queryAvailability(first)).slots, [])
})

test("availability query is read-only and does not mutate operational state", async () => {
  const fixture = await createFixture("read-only")
  const chair = await addGeneralChair(fixture.shop.id, 1)

  const before = {
    customerCount: await db.customer.count({
      where: { barbershopId: fixture.shop.id },
    }),
    bookingCount: await db.booking.count({
      where: { barbershopId: fixture.shop.id },
    }),
    chair: await db.chair.findUnique({ where: { id: chair.id } }),
    service: await db.service.findUnique({ where: { id: fixture.service.id } }),
    opening: await db.openingHour.findUnique({
      where: {
        barbershopId_weekday: {
          barbershopId: fixture.shop.id,
          weekday: weekdayOf(fixture.localDate),
        },
      },
    }),
  }

  await queryAvailability(fixture)

  const afterState = {
    customerCount: await db.customer.count({
      where: { barbershopId: fixture.shop.id },
    }),
    bookingCount: await db.booking.count({
      where: { barbershopId: fixture.shop.id },
    }),
    chair: await db.chair.findUnique({ where: { id: chair.id } }),
    service: await db.service.findUnique({ where: { id: fixture.service.id } }),
    opening: await db.openingHour.findUnique({
      where: {
        barbershopId_weekday: {
          barbershopId: fixture.shop.id,
          weekday: weekdayOf(fixture.localDate),
        },
      },
    }),
  }

  assert.deepEqual(afterState, before)
})

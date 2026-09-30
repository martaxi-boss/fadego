import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, test } from "node:test"
import {
  BookingEngineError,
  cancelBookingByCustomer,
  cancelBookingByShop,
  createBooking,
  reassignBookingToGeneral,
  reassignBookingToStaff,
  rescheduleBooking,
} from "../lib/booking-engine"
import { updateStaffMember } from "../lib/operational-config"
import { db, getPool } from "../lib/prisma"

const createdShopIds: string[] = []

const utc = (
  hour: number,
  minute = 0,
  day = "2030-01-07",
) =>
  new Date(
    `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`,
  )

const createShop = async (
  tag: string,
  options?: {
    timezone?: string | null
    createDefaultHours?: boolean
    serviceDurationMinutes?: number
    servicePrice?: string
  },
) => {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10)
  const shop = await db.barbershop.create({
    data: {
      name: `Booking ${tag}`,
      slug: `booking-${tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}`,
      timezone:
        options && "timezone" in options
          ? options.timezone
          : "Europe/Lisbon",
    },
  })
  createdShopIds.push(shop.id)

  if (options?.createDefaultHours !== false) {
    await db.openingHour.createMany({
      data: Array.from({ length: 7 }, (_, weekday) => ({
        barbershopId: shop.id,
        weekday,
        isClosed: false,
        opensAt: 8 * 60,
        closesAt: 20 * 60,
      })),
    })
  }

  const customer = await db.customer.create({
    data: {
      barbershopId: shop.id,
      name: `Customer ${tag}`,
      phone: "+351900000000",
      email: `${tag.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@example.test`,
    },
  })

  const service = await db.service.create({
    data: {
      barbershopId: shop.id,
      name: `Service ${tag}`,
      price: options?.servicePrice ?? "20.00",
      durationMinutes: options?.serviceDurationMinutes ?? 30,
      active: true,
    },
  })

  return { shop, customer, service }
}

const createGeneralChair = async (
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

const createWalkInChair = async (barbershopId: string, number: number) =>
  db.chair.create({
    data: {
      barbershopId,
      number,
      mode: "WALK_IN",
      active: true,
    },
  })

const createStaffWithChair = async (
  barbershopId: string,
  number: number,
  name: string,
  options?: { active?: boolean; archived?: boolean },
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

const bookingInput = (
  fixture: Awaited<ReturnType<typeof createShop>>,
  startsAt: Date,
  requestedStaffMemberId?: string,
) => ({
  barbershopId: fixture.shop.id,
  customerId: fixture.customer.id,
  serviceId: fixture.service.id,
  startsAt,
  requestedStaffMemberId,
})

const expectBookingCode = async (
  action: () => Promise<unknown>,
  code:
    | "TENANT_UNAVAILABLE"
    | "TIMEZONE_UNAVAILABLE"
    | "CUSTOMER_UNAVAILABLE"
    | "SERVICE_UNAVAILABLE"
    | "STAFF_UNAVAILABLE"
    | "INVALID_GRID"
    | "OUTSIDE_OPENING_HOURS"
    | "NO_CAPACITY"
    | "BOOKING_UNAVAILABLE"
    | "INVALID_STATUS",
) => {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof BookingEngineError)
    assert.equal(error.code, code)
    return true
  })
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

test("one GENERAL chair provides exactly one simultaneous booking slot", async () => {
  const fixture = await createShop("one-general")
  await createGeneralChair(fixture.shop.id, 1)

  const first = await createBooking(bookingInput(fixture, utc(9)))
  assert.equal(first.chairNumberSnapshot, 1)

  await expectBookingCode(
    () => createBooking(bookingInput(fixture, utc(9))),
    "NO_CAPACITY",
  )
})

test("three GENERAL chairs provide exactly three simultaneous booking slots", async () => {
  const fixture = await createShop("three-general")
  await Promise.all([
    createGeneralChair(fixture.shop.id, 1),
    createGeneralChair(fixture.shop.id, 2),
    createGeneralChair(fixture.shop.id, 3),
  ])

  const bookings = []
  for (let index = 0; index < 3; index += 1) {
    bookings.push(await createBooking(bookingInput(fixture, utc(10))))
  }

  assert.deepEqual(
    bookings.map((booking) => booking.chairNumberSnapshot),
    [1, 2, 3],
  )

  await expectBookingCode(
    () => createBooking(bookingInput(fixture, utc(10))),
    "NO_CAPACITY",
  )
})

test("WALK_IN, inactive and STAFF_BOOKING chairs do not increase general capacity", async () => {
  const fixture = await createShop("general-eligibility")
  await createWalkInChair(fixture.shop.id, 1)
  await createGeneralChair(fixture.shop.id, 2, false)
  await createStaffWithChair(fixture.shop.id, 3, "Identified")

  await expectBookingCode(
    () => createBooking(bookingInput(fixture, utc(11))),
    "NO_CAPACITY",
  )
})

test("active identified professional can be booked", async () => {
  const fixture = await createShop("staff-active")
  const { staff, chair } = await createStaffWithChair(
    fixture.shop.id,
    1,
    "Joao",
  )

  const booking = await createBooking(
    bookingInput(fixture, utc(9), staff.id),
  )

  assert.equal(booking.mode, "STAFF_BOOKING")
  assert.equal(booking.staffMemberId, staff.id)
  assert.equal(booking.chairId, chair.id)
  assert.equal(booking.staffNameSnapshot, "Joao")
})

test("inactive and archived professionals are rejected for new bookings", async () => {
  const inactiveFixture = await createShop("staff-inactive")
  const inactive = await createStaffWithChair(
    inactiveFixture.shop.id,
    1,
    "Inactive",
    { active: false },
  )

  await expectBookingCode(
    () =>
      createBooking(
        bookingInput(inactiveFixture, utc(9), inactive.staff.id),
      ),
    "STAFF_UNAVAILABLE",
  )

  const archivedFixture = await createShop("staff-archived")
  const archived = await createStaffWithChair(
    archivedFixture.shop.id,
    1,
    "Archived",
    { archived: true },
  )

  await expectBookingCode(
    () =>
      createBooking(
        bookingInput(archivedFixture, utc(9), archived.staff.id),
      ),
    "STAFF_UNAVAILABLE",
  )
})

test("same professional cannot overlap even if multiple chairs reference them", async () => {
  const fixture = await createShop("staff-double")
  const { staff } = await createStaffWithChair(fixture.shop.id, 1, "Double")
  await db.chair.create({
    data: {
      barbershopId: fixture.shop.id,
      number: 2,
      mode: "STAFF_BOOKING",
      staffMemberId: staff.id,
      active: true,
    },
  })

  await createBooking(bookingInput(fixture, utc(9), staff.id))

  await expectBookingCode(
    () => createBooking(bookingInput(fixture, utc(9), staff.id)),
    "NO_CAPACITY",
  )
})

test("half-open adjacency is allowed on the same Chair", async () => {
  const fixture = await createShop("adjacency", {
    serviceDurationMinutes: 30,
  })
  await createGeneralChair(fixture.shop.id, 1)

  const first = await createBooking(bookingInput(fixture, utc(9)))
  const second = await createBooking(bookingInput(fixture, utc(9, 30)))

  assert.equal(first.endsAt.getTime(), second.startsAt.getTime())
  assert.equal(first.chairId, second.chairId)
})

test("one-minute overlap attempt is rejected and malformed grid never reaches capacity", async () => {
  const fixture = await createShop("one-minute-overlap", {
    serviceDurationMinutes: 30,
  })
  await createGeneralChair(fixture.shop.id, 1)
  await createBooking(bookingInput(fixture, utc(9)))

  await expectBookingCode(
    () => createBooking(bookingInput(fixture, utc(9, 29))),
    "INVALID_GRID",
  )
})

test("booking duration is authoritative from Service snapshot", async () => {
  const fixture = await createShop("duration-snapshot", {
    serviceDurationMinutes: 45,
  })
  await createGeneralChair(fixture.shop.id, 1)

  const booking = await createBooking(bookingInput(fixture, utc(12)))

  assert.equal(booking.serviceDurationMinutes, 45)
  assert.equal(
    booking.endsAt.getTime() - booking.startsAt.getTime(),
    45 * 60 * 1000,
  )
})

test("start outside the canonical 15-minute grid is rejected", async () => {
  const fixture = await createShop("grid")
  await createGeneralChair(fixture.shop.id, 1)

  await expectBookingCode(
    () => createBooking(bookingInput(fixture, utc(9, 7))),
    "INVALID_GRID",
  )
})

test("different tenants can book the same instant independently", async () => {
  const first = await createShop("tenant-time-a")
  const second = await createShop("tenant-time-b")
  await createGeneralChair(first.shop.id, 1)
  await createGeneralChair(second.shop.id, 1)

  const [bookingA, bookingB] = await Promise.all([
    createBooking(bookingInput(first, utc(10))),
    createBooking(bookingInput(second, utc(10))),
  ])

  assert.notEqual(bookingA.barbershopId, bookingB.barbershopId)
})

test("cross-tenant Customer and Service are rejected", async () => {
  const first = await createShop("cross-domain-a")
  const second = await createShop("cross-domain-b")
  await createGeneralChair(first.shop.id, 1)

  await expectBookingCode(
    () =>
      createBooking({
        barbershopId: first.shop.id,
        customerId: second.customer.id,
        serviceId: first.service.id,
        startsAt: utc(9),
      }),
    "CUSTOMER_UNAVAILABLE",
  )

  await expectBookingCode(
    () =>
      createBooking({
        barbershopId: first.shop.id,
        customerId: first.customer.id,
        serviceId: second.service.id,
        startsAt: utc(9),
      }),
    "SERVICE_UNAVAILABLE",
  )
})

test("cross-tenant StaffMember is rejected", async () => {
  const first = await createShop("cross-staff-a")
  const second = await createShop("cross-staff-b")
  const foreign = await createStaffWithChair(second.shop.id, 1, "Foreign")
  await createStaffWithChair(first.shop.id, 1, "Local")

  await expectBookingCode(
    () =>
      createBooking(
        bookingInput(first, utc(9), foreign.staff.id),
      ),
    "STAFF_UNAVAILABLE",
  )
})

test("direct cross-tenant Booking foreign key attempt is rejected by PostgreSQL", async () => {
  const first = await createShop("cross-fk-a")
  const second = await createShop("cross-fk-b")
  const chair = await createGeneralChair(first.shop.id, 1)

  await assert.rejects(() =>
    db.booking.create({
      data: {
        barbershopId: first.shop.id,
        customerId: second.customer.id,
        serviceId: first.service.id,
        chairId: chair.id,
        mode: "GENERAL_BOOKING",
        startsAt: utc(9),
        endsAt: utc(9, 30),
        serviceNameSnapshot: first.service.name,
        serviceDurationMinutes: 30,
        servicePriceSnapshot: first.service.price,
        customerNameSnapshot: second.customer.name,
        customerPhoneSnapshot: second.customer.phone,
        customerEmailSnapshot: second.customer.email,
        chairNumberSnapshot: chair.number,
      },
    }),
  )
})

test("Service edits never rewrite historical Booking snapshots", async () => {
  const fixture = await createShop("service-history", {
    serviceDurationMinutes: 30,
    servicePrice: "20.00",
  })
  await createGeneralChair(fixture.shop.id, 1)
  const booking = await createBooking(bookingInput(fixture, utc(9)))

  await db.service.update({
    where: { id: fixture.service.id },
    data: {
      name: "Changed service",
      durationMinutes: 60,
      price: "99.00",
    },
  })

  const persisted = await db.booking.findUnique({ where: { id: booking.id } })
  assert.ok(persisted)
  assert.equal(persisted.serviceNameSnapshot, fixture.service.name)
  assert.equal(persisted.serviceDurationMinutes, 30)
  assert.equal(persisted.servicePriceSnapshot.toString(), "20")
})

test("Customer edits never rewrite historical contact snapshots", async () => {
  const fixture = await createShop("customer-history")
  await createGeneralChair(fixture.shop.id, 1)
  const booking = await createBooking(bookingInput(fixture, utc(9)))

  await db.customer.update({
    where: { id: fixture.customer.id },
    data: {
      name: "Changed customer",
      phone: "+351911111111",
      email: "changed@example.test",
    },
  })

  const persisted = await db.booking.findUnique({ where: { id: booking.id } })
  assert.ok(persisted)
  assert.equal(persisted.customerNameSnapshot, fixture.customer.name)
  assert.equal(persisted.customerPhoneSnapshot, fixture.customer.phone)
  assert.equal(persisted.customerEmailSnapshot, fixture.customer.email)
})

test("operational references cannot be hard-deleted while Booking history exists", async () => {
  const fixture = await createShop("history-restrict")
  const chair = await createGeneralChair(fixture.shop.id, 1)
  await createBooking(bookingInput(fixture, utc(9)))

  await assert.rejects(() =>
    db.customer.delete({ where: { id: fixture.customer.id } }),
  )
  await assert.rejects(() =>
    db.service.delete({ where: { id: fixture.service.id } }),
  )
  await assert.rejects(() => db.chair.delete({ where: { id: chair.id } }))
})

test("closed day and starts before opening are rejected", async () => {
  const closed = await createShop("closed-day")
  await createGeneralChair(closed.shop.id, 1)
  await db.openingHour.update({
    where: {
      barbershopId_weekday: {
        barbershopId: closed.shop.id,
        weekday: 0,
      },
    },
    data: { isClosed: true, opensAt: null, closesAt: null },
  })

  await expectBookingCode(
    () => createBooking(bookingInput(closed, utc(9))),
    "OUTSIDE_OPENING_HOURS",
  )

  const before = await createShop("before-open")
  await createGeneralChair(before.shop.id, 1)
  await expectBookingCode(
    () => createBooking(bookingInput(before, utc(7, 45))),
    "OUTSIDE_OPENING_HOURS",
  )
})

test("booking after closing is rejected and exact closing boundary is allowed", async () => {
  const fixture = await createShop("close-boundary", {
    serviceDurationMinutes: 60,
  })
  await createGeneralChair(fixture.shop.id, 1)

  const exact = await createBooking(bookingInput(fixture, utc(19)))
  assert.equal(exact.endsAt.getTime(), utc(20).getTime())

  await expectBookingCode(
    () => createBooking(bookingInput(fixture, utc(19, 15))),
    "OUTSIDE_OPENING_HOURS",
  )
})

test("shop timezone controls weekday and local-minute opening validation", async () => {
  const fixture = await createShop("timezone-authority", {
    timezone: "America/New_York",
    createDefaultHours: false,
  })
  await createGeneralChair(fixture.shop.id, 1)
  await db.openingHour.create({
    data: {
      barbershopId: fixture.shop.id,
      weekday: 0,
      isClosed: false,
      opensAt: 20 * 60,
      closesAt: 22 * 60,
    },
  })

  const booking = await createBooking(
    bookingInput(
      fixture,
      new Date("2030-01-08T02:00:00.000Z"),
    ),
  )

  assert.equal(booking.status, "CONFIRMED")
})

test("missing or invalid shop timezone is rejected safely", async () => {
  const missing = await createShop("timezone-missing", { timezone: null })
  await createGeneralChair(missing.shop.id, 1)
  await expectBookingCode(
    () => createBooking(bookingInput(missing, utc(9))),
    "TIMEZONE_UNAVAILABLE",
  )

  const invalid = await createShop("timezone-invalid", {
    timezone: "Not/A_Real_Zone",
  })
  await createGeneralChair(invalid.shop.id, 1)
  await expectBookingCode(
    () => createBooking(bookingInput(invalid, utc(9))),
    "TIMEZONE_UNAVAILABLE",
  )
})

test("SUSPENDED tenant cannot create a new Booking", async () => {
  const fixture = await createShop("suspended")
  await createGeneralChair(fixture.shop.id, 1)
  await db.barbershop.update({
    where: { id: fixture.shop.id },
    data: { status: "SUSPENDED" },
  })

  await expectBookingCode(
    () => createBooking(bookingInput(fixture, utc(9))),
    "TENANT_UNAVAILABLE",
  )
})

test("customer and shop cancellation preserve rows and release capacity", async () => {
  const fixture = await createShop("cancel")
  await createGeneralChair(fixture.shop.id, 1)

  const first = await createBooking(bookingInput(fixture, utc(9)))
  const customerCancelled = await cancelBookingByCustomer(
    fixture.shop.id,
    first.id,
  )
  assert.equal(customerCancelled.status, "CANCELLED_BY_CUSTOMER")
  assert.ok(await db.booking.findUnique({ where: { id: first.id } }))

  const replacement = await createBooking(bookingInput(fixture, utc(9)))
  const shopCancelled = await cancelBookingByShop(
    fixture.shop.id,
    replacement.id,
  )
  assert.equal(shopCancelled.status, "CANCELLED_BY_SHOP")
  assert.ok(await db.booking.findUnique({ where: { id: replacement.id } }))

  await createBooking(bookingInput(fixture, utc(9)))
})

test("terminal cancelled Booking cannot be cancelled into another state", async () => {
  const fixture = await createShop("cancel-terminal")
  await createGeneralChair(fixture.shop.id, 1)
  const booking = await createBooking(bookingInput(fixture, utc(9)))
  await cancelBookingByCustomer(fixture.shop.id, booking.id)

  await expectBookingCode(
    () => cancelBookingByShop(fixture.shop.id, booking.id),
    "INVALID_STATUS",
  )
})

test("successful reschedule updates interval atomically using snapshot duration", async () => {
  const fixture = await createShop("reschedule-success", {
    serviceDurationMinutes: 45,
  })
  await createGeneralChair(fixture.shop.id, 1)
  const booking = await createBooking(bookingInput(fixture, utc(9)))

  await db.service.update({
    where: { id: fixture.service.id },
    data: { durationMinutes: 60 },
  })

  const moved = await rescheduleBooking(
    fixture.shop.id,
    booking.id,
    utc(11),
  )

  assert.equal(moved.startsAt.getTime(), utc(11).getTime())
  assert.equal(moved.endsAt.getTime(), utc(11, 45).getTime())
  assert.equal(moved.serviceDurationMinutes, 45)
})

test("conflicting reschedule is rejected and leaves original interval unchanged", async () => {
  const fixture = await createShop("reschedule-conflict")
  await createGeneralChair(fixture.shop.id, 1)
  const first = await createBooking(bookingInput(fixture, utc(9)))
  await createBooking(bookingInput(fixture, utc(10)))

  await expectBookingCode(
    () => rescheduleBooking(fixture.shop.id, first.id, utc(10)),
    "NO_CAPACITY",
  )

  const persisted = await db.booking.findUnique({ where: { id: first.id } })
  assert.ok(persisted)
  assert.equal(persisted.startsAt.getTime(), utc(9).getTime())
  assert.equal(persisted.endsAt.getTime(), utc(9, 30).getTime())
})

test("staff deactivation marks future booking NEEDS_REASSIGNMENT without transfer", async () => {
  const fixture = await createShop("needs-reassignment")
  const { staff, chair } = await createStaffWithChair(
    fixture.shop.id,
    1,
    "Departing",
  )
  const booking = await createBooking(
    bookingInput(fixture, utc(9), staff.id),
  )

  await updateStaffMember(fixture.shop.id, staff.id, {
    name: staff.name,
    photoUrl: null,
    active: false,
    archived: false,
  })

  const persisted = await db.booking.findUnique({ where: { id: booking.id } })
  assert.ok(persisted)
  assert.equal(persisted.status, "NEEDS_REASSIGNMENT")
  assert.equal(persisted.staffMemberId, staff.id)
  assert.equal(persisted.chairId, chair.id)
})

test("NEEDS_REASSIGNMENT still blocks its current Chair interval", async () => {
  const fixture = await createShop("needs-blocks")
  const { staff, chair } = await createStaffWithChair(
    fixture.shop.id,
    1,
    "Blocking",
  )
  const booking = await createBooking(
    bookingInput(fixture, utc(9), staff.id),
  )

  await updateStaffMember(fixture.shop.id, staff.id, {
    name: staff.name,
    photoUrl: null,
    active: false,
    archived: false,
  })

  await assert.rejects(() =>
    db.booking.create({
      data: {
        barbershopId: fixture.shop.id,
        customerId: fixture.customer.id,
        serviceId: fixture.service.id,
        chairId: chair.id,
        staffMemberId: staff.id,
        mode: "STAFF_BOOKING",
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        status: "CONFIRMED",
        serviceNameSnapshot: booking.serviceNameSnapshot,
        serviceDurationMinutes: booking.serviceDurationMinutes,
        servicePriceSnapshot: booking.servicePriceSnapshot,
        customerNameSnapshot: booking.customerNameSnapshot,
        customerPhoneSnapshot: booking.customerPhoneSnapshot,
        customerEmailSnapshot: booking.customerEmailSnapshot,
        staffNameSnapshot: staff.name,
        chairNumberSnapshot: chair.number,
      },
    }),
  )
})

test("reactivating staff does not automatically revert NEEDS_REASSIGNMENT", async () => {
  const fixture = await createShop("reactivation-no-auto")
  const { staff } = await createStaffWithChair(
    fixture.shop.id,
    1,
    "Returning",
  )
  const booking = await createBooking(
    bookingInput(fixture, utc(9), staff.id),
  )

  await updateStaffMember(fixture.shop.id, staff.id, {
    name: staff.name,
    photoUrl: null,
    active: false,
    archived: false,
  })
  await updateStaffMember(fixture.shop.id, staff.id, {
    name: staff.name,
    photoUrl: null,
    active: true,
    archived: false,
  })

  const persisted = await db.booking.findUnique({ where: { id: booking.id } })
  assert.equal(persisted?.status, "NEEDS_REASSIGNMENT")
})

test("NEEDS_REASSIGNMENT can transfer to another valid professional", async () => {
  const fixture = await createShop("reassign-staff")
  const old = await createStaffWithChair(fixture.shop.id, 1, "Old")
  const target = await createStaffWithChair(fixture.shop.id, 2, "Target")
  const booking = await createBooking(
    bookingInput(fixture, utc(9), old.staff.id),
  )

  await updateStaffMember(fixture.shop.id, old.staff.id, {
    name: old.staff.name,
    photoUrl: null,
    active: false,
    archived: false,
  })

  const reassigned = await reassignBookingToStaff(
    fixture.shop.id,
    booking.id,
    target.staff.id,
  )

  assert.equal(reassigned.status, "CONFIRMED")
  assert.equal(reassigned.mode, "STAFF_BOOKING")
  assert.equal(reassigned.staffMemberId, target.staff.id)
  assert.equal(reassigned.chairId, target.chair.id)
  assert.equal(reassigned.staffNameSnapshot, "Target")
})

test("NEEDS_REASSIGNMENT can transfer to GENERAL capacity", async () => {
  const fixture = await createShop("reassign-general")
  const old = await createStaffWithChair(fixture.shop.id, 1, "Old")
  const general = await createGeneralChair(fixture.shop.id, 2)
  const booking = await createBooking(
    bookingInput(fixture, utc(9), old.staff.id),
  )

  await updateStaffMember(fixture.shop.id, old.staff.id, {
    name: old.staff.name,
    photoUrl: null,
    active: false,
    archived: false,
  })

  const reassigned = await reassignBookingToGeneral(
    fixture.shop.id,
    booking.id,
  )

  assert.equal(reassigned.status, "CONFIRMED")
  assert.equal(reassigned.mode, "GENERAL_BOOKING")
  assert.equal(reassigned.staffMemberId, null)
  assert.equal(reassigned.staffNameSnapshot, null)
  assert.equal(reassigned.chairId, general.id)
})

test("failed reassignment for lack of capacity leaves NEEDS_REASSIGNMENT unchanged", async () => {
  const fixture = await createShop("reassign-failure")
  const old = await createStaffWithChair(fixture.shop.id, 1, "Old")
  const target = await createStaffWithChair(fixture.shop.id, 2, "Busy")
  const original = await createBooking(
    bookingInput(fixture, utc(9), old.staff.id),
  )
  await createBooking(
    bookingInput(fixture, utc(9), target.staff.id),
  )

  await updateStaffMember(fixture.shop.id, old.staff.id, {
    name: old.staff.name,
    photoUrl: null,
    active: false,
    archived: false,
  })

  await expectBookingCode(
    () =>
      reassignBookingToStaff(
        fixture.shop.id,
        original.id,
        target.staff.id,
      ),
    "NO_CAPACITY",
  )

  const persisted = await db.booking.findUnique({ where: { id: original.id } })
  assert.ok(persisted)
  assert.equal(persisted.status, "NEEDS_REASSIGNMENT")
  assert.equal(persisted.staffMemberId, old.staff.id)
  assert.equal(persisted.chairId, old.chair.id)
})

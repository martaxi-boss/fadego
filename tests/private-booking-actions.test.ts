import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { after, test } from "node:test"
import {
  createBooking,
  type BookingClock,
} from "../lib/booking-engine"
import { hashAccessCode } from "../lib/booking-access"
import { updateStaffMember } from "../lib/operational-config"
import {
  buildPrivateMutationRateLimitKey,
  cancelPrivateBooking,
  getPrivateRescheduleAvailability,
  reschedulePrivateBooking,
} from "../lib/private-booking-actions"
import { db, getPool } from "../lib/prisma"
import {
  createPublicBooking,
  getPublicAvailability,
  lookupPrivateBooking,
} from "../lib/public-booking"
import {
  buildQrMatrix,
  privateQrPayload,
} from "../lib/qr-code"
import {
  RATE_LIMITS,
  type RateLimitName,
} from "../lib/rate-limit"

const createdShopIds: string[] = []
const bookingClock: BookingClock = {
  now: () => new Date("2029-01-01T00:00:00.000Z"),
}
const availabilityClock = bookingClock
const allowLimit = async (_name: RateLimitName, _key: string) => ({
  allowed: true,
  retryAfterSeconds: 0,
})

const createFixture = async (
  tag: string,
  options?: {
    serviceDurationMinutes?: number
  },
) => {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10)
  const shop = await db.barbershop.create({
    data: {
      name: `Private ${tag}`,
      slug: `private-${tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}`,
      timezone: "UTC",
      status: "ACTIVE",
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

  const service = await db.service.create({
    data: {
      barbershopId: shop.id,
      name: `Service ${tag}`,
      description: "Private lifecycle",
      price: "25.00",
      durationMinutes: options?.serviceDurationMinutes ?? 30,
      active: true,
    },
  })

  return { shop, service }
}

const addGeneralChair = async (
  barbershopId: string,
  number = 1,
) =>
  db.chair.create({
    data: {
      barbershopId,
      number,
      mode: "GENERAL_BOOKING",
      active: true,
    },
  })

const addStaff = async (
  barbershopId: string,
  number = 1,
  name = "Ana",
) => {
  const staff = await db.staffMember.create({
    data: {
      barbershopId,
      name,
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

const addStaffChair = async (
  barbershopId: string,
  staffMemberId: string,
  number: number,
) =>
  db.chair.create({
    data: {
      barbershopId,
      number,
      mode: "STAFF_BOOKING",
      staffMemberId,
      active: true,
    },
  })

const addCustomer = async (barbershopId: string, tag: string) =>
  db.customer.create({
    data: {
      barbershopId,
      name: `Blocker ${tag}`,
      phone: "+12025550111",
    },
  })

const createPublic = async (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  startsAt = "2030-01-07T09:00:00.000Z",
  requestedStaffMemberId?: string,
) =>
  createPublicBooking(
    {
      barbershopSlug: fixture.shop.slug,
      serviceId: fixture.service.id,
      requestedStaffMemberId,
      startsAt,
      customer: {
        name: "Private Customer",
        phone: "+351 910 000 000",
        email: "private@example.test",
      },
    },
    {
      sourceIp: "198.51.100.50",
      clock: bookingClock,
      consumeLimit: allowLimit,
    },
  )

const privateLookup = (code: string) =>
  lookupPrivateBooking(code, {
    sourceIp: "198.51.100.51",
    consumeLimit: allowLimit,
  })

const cancelPrivate = (
  code: string,
  consumeLimit = allowLimit,
) =>
  cancelPrivateBooking(code, {
    sourceIp: "198.51.100.52",
    consumeLimit,
  })

const privateAvailability = (
  code: string,
  localDate = "2030-01-07",
  consumeLimit = allowLimit,
) =>
  getPrivateRescheduleAvailability(code, localDate, {
    sourceIp: "198.51.100.53",
    consumeLimit,
  })

const privateReschedule = (
  code: string,
  startsAt: unknown,
  consumeLimit = allowLimit,
) =>
  reschedulePrivateBooking(
    code,
    { startsAt },
    {
      sourceIp: "198.51.100.54",
      consumeLimit,
    },
  )

const tokenForCode = (code: string) =>
  db.bookingAccessToken.findUnique({
    where: { tokenHash: hashAccessCode(code) },
    select: {
      id: true,
      bookingId: true,
      barbershopId: true,
      revokedAt: true,
      booking: true,
    },
  })

after(async () => {
  if (createdShopIds.length > 0) {
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
    await db.barbershop.deleteMany({
      where: { id: { in: createdShopIds } },
    })
  }

  await db.$disconnect()
  await getPool().end()
})

test("local QR uses the current private URL without persistence or external service", async () => {
  const fixture = await createFixture("qr")
  await addGeneralChair(fixture.shop.id)
  const created = await createPublic(fixture)
  assert.equal(created.ok, true)
  if (!created.ok) return

  const tokenCount = await db.bookingAccessToken.count({
    where: { barbershopId: fixture.shop.id },
  })
  const currentUrl = `https://fadego.example/r/${created.accessCode}`
  assert.equal(privateQrPayload(currentUrl), currentUrl)

  const matrix = buildQrMatrix(privateQrPayload(currentUrl))
  assert.ok(matrix.length >= 21)
  assert.equal(matrix.length % 2, 1)
  assert.equal(matrix.every((row) => row.length === matrix.length), true)
  assert.equal(matrix.flat().every((cell) => typeof cell === "boolean"), true)

  assert.equal(
    await db.bookingAccessToken.count({
      where: { barbershopId: fixture.shop.id },
    }),
    tokenCount,
  )

  const qrSource = readFileSync("lib/qr-code.ts", "utf8")
  const controls = readFileSync(
    "app/r/[code]/private-booking-controls.tsx",
    "utf8",
  )
  assert.equal(qrSource.includes("fetch("), false)
  assert.equal(qrSource.includes("http://"), false)
  assert.equal(qrSource.includes("https://"), false)
  assert.equal(qrSource.includes("bookingAccessToken"), false)
  assert.match(controls, /window\.location\.href/)
  assert.match(
    controls,
    /Este QR dá acesso à tua marcação\. Guarda-o em privado\./,
  )
})

test("private page stays dynamic uncached noindex and no-referrer", () => {
  const page = readFileSync("app/r/[code]/page.tsx", "utf8")
  assert.match(page, /dynamic = "force-dynamic"/)
  assert.match(page, /revalidate = 0/)
  assert.match(page, /index:\s*false/)
  assert.match(page, /follow:\s*false/)
  assert.match(page, /referrer:\s*"no-referrer"/)
})

test("CONFIRMED GENERAL cancellation preserves history and releases capacity", async () => {
  const fixture = await createFixture("cancel-general")
  await addGeneralChair(fixture.shop.id)
  const created = await createPublic(fixture)
  assert.equal(created.ok, true)
  if (!created.ok) return

  const tokenBefore = await tokenForCode(created.accessCode)
  assert.ok(tokenBefore)
  const beforeAvailability = await getPublicAvailability(
    {
      barbershopSlug: fixture.shop.slug,
      serviceId: fixture.service.id,
      localDate: "2030-01-07",
    },
    { clock: availabilityClock },
  )
  assert.equal(beforeAvailability.ok, true)
  if (beforeAvailability.ok) {
    assert.equal(
      beforeAvailability.availability.slots.some(
        (slot) => slot.localTime === "09:00",
      ),
      false,
    )
  }

  assert.deepEqual(await cancelPrivate(created.accessCode), { ok: true })

  const tokenAfter = await tokenForCode(created.accessCode)
  assert.ok(tokenAfter)
  assert.equal(tokenAfter.id, tokenBefore.id)
  assert.equal(tokenAfter.revokedAt, null)
  assert.equal(tokenAfter.booking.status, "CANCELLED_BY_CUSTOMER")
  assert.equal(
    await db.customer.count({ where: { barbershopId: fixture.shop.id } }),
    1,
  )
  assert.equal(
    await db.booking.count({ where: { barbershopId: fixture.shop.id } }),
    1,
  )

  const resolved = await privateLookup(created.accessCode)
  assert.equal(resolved.ok, true)
  if (resolved.ok) {
    assert.equal(resolved.booking.status, "CANCELLED_BY_CUSTOMER")
    assert.equal(resolved.booking.canCancel, false)
    assert.equal(resolved.booking.canReschedule, false)
  }

  const afterAvailability = await getPublicAvailability(
    {
      barbershopSlug: fixture.shop.slug,
      serviceId: fixture.service.id,
      localDate: "2030-01-07",
    },
    { clock: availabilityClock },
  )
  assert.equal(afterAvailability.ok, true)
  if (afterAvailability.ok) {
    assert.equal(
      afterAvailability.availability.slots.some(
        (slot) => slot.localTime === "09:00",
      ),
      true,
    )
  }
})

test("STAFF cancellation releases professional capacity and preserves token", async () => {
  const fixture = await createFixture("cancel-staff")
  const { staff } = await addStaff(fixture.shop.id)
  const created = await createPublic(
    fixture,
    "2030-01-07T09:00:00.000Z",
    staff.id,
  )
  assert.equal(created.ok, true)
  if (!created.ok) return

  const before = await getPublicAvailability(
    {
      barbershopSlug: fixture.shop.slug,
      serviceId: fixture.service.id,
      requestedStaffMemberId: staff.id,
      localDate: "2030-01-07",
    },
    { clock: availabilityClock },
  )
  assert.equal(before.ok, true)
  if (before.ok) {
    assert.equal(
      before.availability.slots.some((slot) => slot.localTime === "09:00"),
      false,
    )
  }

  assert.deepEqual(await cancelPrivate(created.accessCode), { ok: true })

  const after = await getPublicAvailability(
    {
      barbershopSlug: fixture.shop.slug,
      serviceId: fixture.service.id,
      requestedStaffMemberId: staff.id,
      localDate: "2030-01-07",
    },
    { clock: availabilityClock },
  )
  assert.equal(after.ok, true)
  if (after.ok) {
    assert.equal(
      after.availability.slots.some((slot) => slot.localTime === "09:00"),
      true,
    )
  }

  const token = await tokenForCode(created.accessCode)
  assert.ok(token)
  assert.equal(token.revokedAt, null)
})

test("NEEDS_REASSIGNMENT can cancel but cannot customer-reschedule", async () => {
  const fixture = await createFixture("needs-reassignment")
  const { staff } = await addStaff(fixture.shop.id)
  const created = await createPublic(
    fixture,
    "2030-01-07T09:00:00.000Z",
    staff.id,
  )
  assert.equal(created.ok, true)
  if (!created.ok) return

  await updateStaffMember(fixture.shop.id, staff.id, {
    name: staff.name,
    photoUrl: null,
    active: false,
    archived: false,
  })

  const before = await privateLookup(created.accessCode)
  assert.equal(before.ok, true)
  if (before.ok) {
    assert.equal(before.booking.status, "NEEDS_REASSIGNMENT")
    assert.equal(before.booking.canCancel, true)
    assert.equal(before.booking.canReschedule, false)
  }

  assert.deepEqual(await privateAvailability(created.accessCode), {
    ok: false,
    code: "ACTION_UNAVAILABLE",
  })
  assert.deepEqual(
    await privateReschedule(
      created.accessCode,
      "2030-01-07T10:00:00.000Z",
    ),
    { ok: false, code: "ACTION_UNAVAILABLE" },
  )
  assert.deepEqual(await cancelPrivate(created.accessCode), { ok: true })

  const after = await privateLookup(created.accessCode)
  assert.equal(after.ok, true)
  if (after.ok) {
    assert.equal(after.booking.status, "CANCELLED_BY_CUSTOMER")
  }
})

test("terminal statuses and repeated cancellation reject without deletion", async () => {
  const statuses = [
    "COMPLETED",
    "CANCELLED_BY_CUSTOMER",
    "CANCELLED_BY_SHOP",
    "NO_SHOW",
  ] as const

  for (const status of statuses) {
    const fixture = await createFixture(`cancel-terminal-${status.toLowerCase()}`)
    await addGeneralChair(fixture.shop.id)
    const created = await createPublic(fixture)
    assert.equal(created.ok, true)
    if (!created.ok) continue
    const token = await tokenForCode(created.accessCode)
    assert.ok(token)

    await db.booking.update({
      where: { id: token.bookingId },
      data: { status },
    })

    assert.deepEqual(await cancelPrivate(created.accessCode), {
      ok: false,
      code: "ACTION_UNAVAILABLE",
    })
    assert.equal(
      await db.booking.count({ where: { id: token.bookingId } }),
      1,
    )
    assert.equal(
      await db.bookingAccessToken.count({ where: { id: token.id } }),
      1,
    )
  }

  const repeatedFixture = await createFixture("cancel-repeated")
  await addGeneralChair(repeatedFixture.shop.id)
  const repeated = await createPublic(repeatedFixture)
  assert.equal(repeated.ok, true)
  if (!repeated.ok) return
  assert.deepEqual(await cancelPrivate(repeated.accessCode), { ok: true })
  assert.deepEqual(await cancelPrivate(repeated.accessCode), {
    ok: false,
    code: "ACTION_UNAVAILABLE",
  })
})

test("GENERAL reschedule availability excludes the current Booking itself", async () => {
  const fixture = await createFixture("self-exclusion")
  await addGeneralChair(fixture.shop.id)
  const created = await createPublic(fixture)
  assert.equal(created.ok, true)
  if (!created.ok) return

  const availability = await privateAvailability(created.accessCode)
  assert.equal(availability.ok, true)
  if (availability.ok) {
    assert.equal(
      availability.availability.slots.some(
        (slot) => slot.localTime === "09:00",
      ),
      true,
    )
    assert.equal(availability.availability.serviceDurationMinutes, 30)
  }
})

test("GENERAL reschedule preserves identity and can reallocate Chair", async () => {
  const fixture = await createFixture("general-identity")
  await addGeneralChair(fixture.shop.id, 1)
  await addGeneralChair(fixture.shop.id, 2)

  const created = await createPublic(fixture)
  assert.equal(created.ok, true)
  if (!created.ok) return

  const beforeToken = await tokenForCode(created.accessCode)
  assert.ok(beforeToken)
  const before = beforeToken.booking

  const blockerCustomer = await addCustomer(fixture.shop.id, "general")
  await createBooking(
    {
      barbershopId: fixture.shop.id,
      customerId: blockerCustomer.id,
      serviceId: fixture.service.id,
      startsAt: new Date("2030-01-07T10:00:00.000Z"),
    },
    bookingClock,
  )

  assert.deepEqual(
    await privateReschedule(
      created.accessCode,
      "2030-01-07T10:00:00.000Z",
    ),
    { ok: true },
  )

  const afterToken = await tokenForCode(created.accessCode)
  assert.ok(afterToken)
  const after = afterToken.booking
  assert.equal(after.id, before.id)
  assert.equal(after.customerId, before.customerId)
  assert.equal(after.serviceId, before.serviceId)
  assert.equal(after.mode, "GENERAL_BOOKING")
  assert.equal(after.status, "CONFIRMED")
  assert.equal(after.serviceNameSnapshot, before.serviceNameSnapshot)
  assert.equal(after.serviceDurationMinutes, before.serviceDurationMinutes)
  assert.equal(after.servicePriceSnapshot.toString(), before.servicePriceSnapshot.toString())
  assert.notEqual(after.chairId, before.chairId)
  assert.equal(afterToken.id, beforeToken.id)
  assert.equal(afterToken.revokedAt, null)

  const oldTime = await getPublicAvailability(
    {
      barbershopSlug: fixture.shop.slug,
      serviceId: fixture.service.id,
      localDate: "2030-01-07",
    },
    { clock: availabilityClock },
  )
  assert.equal(oldTime.ok, true)
  if (oldTime.ok) {
    assert.equal(
      oldTime.availability.slots.some(
        (slot) => slot.localTime === "09:00",
      ),
      true,
    )
    assert.equal(
      oldTime.availability.slots.some(
        (slot) => slot.localTime === "10:00",
      ),
      false,
    )
  }
})

test("STAFF reschedule keeps the same professional and capacity stays one", async () => {
  const fixture = await createFixture("staff-reschedule")
  const { staff } = await addStaff(fixture.shop.id, 1, "Ana")
  await addStaffChair(fixture.shop.id, staff.id, 2)
  await addGeneralChair(fixture.shop.id, 3)
  await addStaff(fixture.shop.id, 4, "Other")

  const created = await createPublic(
    fixture,
    "2030-01-07T09:00:00.000Z",
    staff.id,
  )
  assert.equal(created.ok, true)
  if (!created.ok) return

  const availability = await privateAvailability(created.accessCode)
  assert.equal(availability.ok, true)
  if (availability.ok) {
    const ten = availability.availability.slots.find(
      (slot) => slot.localTime === "10:00",
    )
    assert.ok(ten)
    assert.equal(ten.availableCapacity, 1)
  }

  const before = await tokenForCode(created.accessCode)
  assert.ok(before)
  assert.deepEqual(
    await privateReschedule(
      created.accessCode,
      "2030-01-07T10:00:00.000Z",
    ),
    { ok: true },
  )
  const after = await tokenForCode(created.accessCode)
  assert.ok(after)
  assert.equal(after.booking.mode, "STAFF_BOOKING")
  assert.equal(after.booking.staffMemberId, staff.id)
  assert.equal(after.booking.staffMemberId, before.booking.staffMemberId)
  assert.equal(after.booking.id, before.booking.id)
  assert.equal(after.id, before.id)
})

test("inactive STAFF makes reschedule unavailable without General fallback", async () => {
  const fixture = await createFixture("staff-inactive")
  const { staff } = await addStaff(fixture.shop.id, 1, "Ana")
  await addGeneralChair(fixture.shop.id, 2)
  const created = await createPublic(
    fixture,
    "2030-01-07T09:00:00.000Z",
    staff.id,
  )
  assert.equal(created.ok, true)
  if (!created.ok) return

  await db.staffMember.update({
    where: { id: staff.id },
    data: { active: false },
  })

  assert.deepEqual(await privateAvailability(created.accessCode), {
    ok: false,
    code: "ACTION_UNAVAILABLE",
  })
  assert.deepEqual(
    await privateReschedule(
      created.accessCode,
      "2030-01-07T10:00:00.000Z",
    ),
    { ok: false, code: "ACTION_UNAVAILABLE" },
  )

  const token = await tokenForCode(created.accessCode)
  assert.ok(token)
  assert.equal(token.booking.mode, "STAFF_BOOKING")
  assert.equal(token.booking.staffMemberId, staff.id)
})

test("reschedule availability and mutation use the stored duration snapshot", async () => {
  const fixture = await createFixture("snapshot-duration", {
    serviceDurationMinutes: 45,
  })
  await addGeneralChair(fixture.shop.id)
  const created = await createPublic(fixture)
  assert.equal(created.ok, true)
  if (!created.ok) return

  await db.service.update({
    where: { id: fixture.service.id },
    data: { durationMinutes: 60 },
  })

  const availability = await privateAvailability(created.accessCode)
  assert.equal(availability.ok, true)
  if (!availability.ok) return
  assert.equal(availability.availability.serviceDurationMinutes, 45)

  const target = availability.availability.slots.find(
    (slot) => slot.localTime === "10:00",
  )
  assert.ok(target)
  assert.equal(
    target.endsAt.getTime() - target.startsAt.getTime(),
    45 * 60 * 1000,
  )

  assert.deepEqual(
    await privateReschedule(created.accessCode, target.startsAt),
    { ok: true },
  )
  const token = await tokenForCode(created.accessCode)
  assert.ok(token)
  assert.equal(token.booking.serviceDurationMinutes, 45)
  assert.equal(
    token.booking.endsAt.getTime() - token.booking.startsAt.getTime(),
    45 * 60 * 1000,
  )
})

test("stale reschedule rolls back completely and preserves original token", async () => {
  const fixture = await createFixture("stale-reschedule")
  await addGeneralChair(fixture.shop.id)
  const created = await createPublic(fixture)
  assert.equal(created.ok, true)
  if (!created.ok) return

  const observed = await privateAvailability(created.accessCode)
  assert.equal(observed.ok, true)
  if (!observed.ok) return
  const target = observed.availability.slots.find(
    (slot) => slot.localTime === "10:00",
  )
  assert.ok(target)

  const beforeToken = await tokenForCode(created.accessCode)
  assert.ok(beforeToken)
  const bookingCount = await db.booking.count({
    where: { barbershopId: fixture.shop.id },
  })
  const customerCount = await db.customer.count({
    where: { barbershopId: fixture.shop.id },
  })

  const blocker = await addCustomer(fixture.shop.id, "stale")
  await createBooking(
    {
      barbershopId: fixture.shop.id,
      customerId: blocker.id,
      serviceId: fixture.service.id,
      startsAt: target.startsAt,
    },
    bookingClock,
  )

  const countsWithBlocker = {
    bookings: await db.booking.count({
      where: { barbershopId: fixture.shop.id },
    }),
    customers: await db.customer.count({
      where: { barbershopId: fixture.shop.id },
    }),
  }

  assert.equal(countsWithBlocker.bookings, bookingCount + 1)
  assert.equal(countsWithBlocker.customers, customerCount + 1)

  assert.deepEqual(
    await privateReschedule(created.accessCode, target.startsAt),
    { ok: false, code: "SLOT_UNAVAILABLE" },
  )

  const afterToken = await tokenForCode(created.accessCode)
  assert.ok(afterToken)
  assert.equal(afterToken.id, beforeToken.id)
  assert.equal(
    afterToken.booking.startsAt.toISOString(),
    beforeToken.booking.startsAt.toISOString(),
  )
  assert.equal(
    afterToken.booking.endsAt.toISOString(),
    beforeToken.booking.endsAt.toISOString(),
  )
  assert.equal(
    await db.booking.count({ where: { barbershopId: fixture.shop.id } }),
    countsWithBlocker.bookings,
  )
  assert.equal(
    await db.customer.count({ where: { barbershopId: fixture.shop.id } }),
    countsWithBlocker.customers,
  )
})

test("past malformed and terminal reschedule attempts are safe", async () => {
  const fixture = await createFixture("reschedule-failures")
  await addGeneralChair(fixture.shop.id)
  const created = await createPublic(fixture)
  assert.equal(created.ok, true)
  if (!created.ok) return

  const before = await tokenForCode(created.accessCode)
  assert.ok(before)

  assert.deepEqual(
    await privateReschedule(created.accessCode, "not-a-date"),
    { ok: false, code: "INVALID_INPUT" },
  )
  assert.deepEqual(
    await privateReschedule(
      created.accessCode,
      "2020-01-06T09:00:00.000Z",
    ),
    { ok: false, code: "SLOT_UNAVAILABLE" },
  )

  const still = await tokenForCode(created.accessCode)
  assert.ok(still)
  assert.equal(
    still.booking.startsAt.toISOString(),
    before.booking.startsAt.toISOString(),
  )

  for (const status of [
    "CANCELLED_BY_CUSTOMER",
    "CANCELLED_BY_SHOP",
    "COMPLETED",
    "NO_SHOW",
  ] as const) {
    await db.booking.update({
      where: { id: before.bookingId },
      data: { status },
    })
    assert.deepEqual(
      await privateReschedule(
        created.accessCode,
        "2030-01-07T11:00:00.000Z",
      ),
      { ok: false, code: "ACTION_UNAVAILABLE" },
    )
  }
})

test("malformed unknown revoked and Booking-id credentials cannot mutate", async () => {
  const fixture = await createFixture("auth-boundary")
  await addGeneralChair(fixture.shop.id)
  const created = await createPublic(fixture)
  assert.equal(created.ok, true)
  if (!created.ok) return
  const token = await tokenForCode(created.accessCode)
  assert.ok(token)

  for (const code of ["bad", "ABCDEFG2", token.bookingId]) {
    assert.deepEqual(await cancelPrivate(code), {
      ok: false,
      code: "UNAVAILABLE",
    })
    assert.deepEqual(
      await privateReschedule(code, "2030-01-07T10:00:00.000Z"),
      { ok: false, code: "UNAVAILABLE" },
    )
  }

  await db.bookingAccessToken.update({
    where: { id: token.id },
    data: { revokedAt: new Date("2030-01-01T00:00:00.000Z") },
  })

  assert.deepEqual(await cancelPrivate(created.accessCode), {
    ok: false,
    code: "UNAVAILABLE",
  })
  assert.deepEqual(
    await privateReschedule(
      created.accessCode,
      "2030-01-07T10:00:00.000Z",
    ),
    { ok: false, code: "UNAVAILABLE" },
  )
})

test("code for Booking A cannot target Booking B or switch trusted resources through body", async () => {
  const fixture = await createFixture("body-boundary")
  await addGeneralChair(fixture.shop.id, 1)
  await addGeneralChair(fixture.shop.id, 2)
  const staff = await addStaff(fixture.shop.id, 3, "Other Staff")

  const first = await createPublic(
    fixture,
    "2030-01-07T09:00:00.000Z",
  )
  const second = await createPublic(
    fixture,
    "2030-01-07T11:00:00.000Z",
  )
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  if (!first.ok || !second.ok) return

  const firstToken = await tokenForCode(first.accessCode)
  const secondToken = await tokenForCode(second.accessCode)
  assert.ok(firstToken)
  assert.ok(secondToken)

  const result = await reschedulePrivateBooking(
    first.accessCode,
    {
      startsAt: "2030-01-07T10:00:00.000Z",
      bookingId: secondToken.bookingId,
      barbershopId: "foreign",
      customerId: secondToken.booking.customerId,
      staffMemberId: staff.staff.id,
      serviceId: "foreign",
      chairId: staff.chair.id,
      mode: "STAFF_BOOKING",
    },
    {
      sourceIp: "198.51.100.55",
      consumeLimit: allowLimit,
    },
  )
  assert.deepEqual(result, { ok: true })

  const firstAfter = await tokenForCode(first.accessCode)
  const secondAfter = await tokenForCode(second.accessCode)
  assert.ok(firstAfter)
  assert.ok(secondAfter)
  assert.equal(
    firstAfter.booking.startsAt.toISOString(),
    "2030-01-07T10:00:00.000Z",
  )
  assert.equal(
    secondAfter.booking.startsAt.toISOString(),
    secondToken.booking.startsAt.toISOString(),
  )
  assert.equal(firstAfter.booking.mode, "GENERAL_BOOKING")
  assert.equal(firstAfter.booking.staffMemberId, null)
  assert.equal(firstAfter.booking.serviceId, firstToken.booking.serviceId)
  assert.equal(firstAfter.booking.customerId, firstToken.booking.customerId)
})

test("private mutation limiter hashes IP and credential and blocks safely", async () => {
  const ip = "203.0.113.90"
  const code = "7K4M2QX8"
  const key = buildPrivateMutationRateLimitKey(ip, code)
  assert.equal(key.length, 64)
  assert.equal(key.includes(ip), false)
  assert.equal(key.includes(code), false)
  assert.equal(RATE_LIMITS.privateBookingMutation.points, 10)
  assert.equal(RATE_LIMITS.privateBookingMutation.duration, 5 * 60)
  assert.equal(RATE_LIMITS.privateBookingLookup.points, 20)

  const fixture = await createFixture("rate-mutation")
  await addGeneralChair(fixture.shop.id)
  const created = await createPublic(fixture)
  assert.equal(created.ok, true)
  if (!created.ok) return

  const deny = async (_name: RateLimitName, _key: string) => ({
    allowed: false,
    retryAfterSeconds: 60,
  })

  assert.deepEqual(await cancelPrivate(created.accessCode, deny), {
    ok: false,
    code: "RATE_LIMITED",
  })
  const token = await tokenForCode(created.accessCode)
  assert.ok(token)
  assert.equal(token.booking.status, "CONFIRMED")
})

test("private availability reuses bounded private-read limiter", async () => {
  const fixture = await createFixture("rate-read")
  await addGeneralChair(fixture.shop.id)
  const created = await createPublic(fixture)
  assert.equal(created.ok, true)
  if (!created.ok) return

  const deny = async (name: RateLimitName, _key: string) => ({
    allowed: name !== "privateBookingLookup",
    retryAfterSeconds: 60,
  })

  assert.deepEqual(
    await privateAvailability(created.accessCode, "2030-01-07", deny),
    { ok: false, code: "RATE_LIMITED" },
  )
})

test("private action routes accept only code plus narrow action input and never mutate on GET", () => {
  const availabilityRoute = readFileSync(
    "app/api/private/bookings/[code]/availability/route.ts",
    "utf8",
  )
  const cancelRoute = readFileSync(
    "app/api/private/bookings/[code]/cancel/route.ts",
    "utf8",
  )
  const rescheduleRoute = readFileSync(
    "app/api/private/bookings/[code]/reschedule/route.ts",
    "utf8",
  )
  const controls = readFileSync(
    "app/r/[code]/private-booking-controls.tsx",
    "utf8",
  )

  for (const route of [availabilityRoute, cancelRoute, rescheduleRoute]) {
    assert.match(route, /export async function POST/)
    assert.match(route, /Cache-Control": "no-store/)
    assert.equal(route.includes("export async function GET"), false)
    assert.equal(route.includes("bookingId"), false)
    assert.equal(route.includes("barbershopId"), false)
    assert.equal(route.includes("customerId"), false)
    assert.equal(route.includes("chairId"), false)
    assert.equal(route.includes("staffMemberId"), false)
    assert.equal(route.includes("serviceId"), false)
  }

  assert.match(controls, /Queres mesmo cancelar esta marcação\?/)
  assert.match(controls, /SLOT_UNAVAILABLE/)
  assert.match(controls, /router\.refresh\(\)/)
})

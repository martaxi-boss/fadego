import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID as uuid } from "node:crypto"
import { after, test } from "node:test"
import {
  ACCESS_CODE_ALPHABET,
  ACCESS_CODE_LENGTH,
  canonicalizeAccessCode,
  generateAccessCode,
  hashAccessCode,
} from "../lib/booking-access"
import {
  cancelBookingByCustomer,
  createBooking,
  type BookingClock,
} from "../lib/booking-engine"
import { db, getPool } from "../lib/prisma"
import {
  buildPrivateLookupRateLimitKey,
  buildPublicCreateRateLimitKey,
  createPublicBooking,
  getPublicAvailability,
  getPublicCatalog,
  lookupPrivateBooking,
  publicBookingInputSchema,
} from "../lib/public-booking"
import {
  consumeRateLimit,
  RATE_LIMITS,
  type RateLimitName,
} from "../lib/rate-limit"
import { sourceIpFromHeaders } from "../lib/request-context"


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
    status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED"
    serviceActive?: boolean
    serviceName?: string
    serviceDurationMinutes?: number
    officialWebsite?: string | null
    instagram?: string | null
  },
) => {
  const suffix = uuid().replace(/-/g, "").slice(0, 10)
  const shop = await db.barbershop.create({
    data: {
      name: `Public ${tag}`,
      slug: `public-${tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}`,
      timezone: "UTC",
      status: options?.status ?? "ACTIVE",
      address: "Rua de Teste 1",
      phone: "+351210000000",
      officialWebsite: options?.officialWebsite ?? "https://example.test",
      instagram: options?.instagram ?? "https://instagram.com/example",
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
      name: options?.serviceName ?? `Service ${tag}`,
      description: "Descrição pública",
      price: "25.00",
      durationMinutes: options?.serviceDurationMinutes ?? 30,
      active: options?.serviceActive ?? true,
    },
  })

  return { shop, service }
}

const addGeneralChair = async (
  barbershopId: string,
  number = 1,
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

const addWalkInChair = async (barbershopId: string, number = 1) =>
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
  number = 1,
  options?: {
    name?: string
    active?: boolean
    archived?: boolean
    chairActive?: boolean
    photoUrl?: string | null
  },
) => {
  const archived = options?.archived ?? false
  const staff = await db.staffMember.create({
    data: {
      barbershopId,
      name: options?.name ?? "Public Staff",
      photoUrl: options?.photoUrl ?? "https://example.test/staff.jpg",
      active: archived ? false : (options?.active ?? true),
      archivedAt: archived ? new Date("2029-01-01T00:00:00.000Z") : null,
    },
  })
  const chair = await db.chair.create({
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

const addBlockingCustomer = (barbershopId: string) =>
  db.customer.create({
    data: {
      barbershopId,
      name: "Existing Customer",
      phone: "+441234567890",
    },
  })

const publicInput = (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  startsAt = "2030-01-07T09:00:00.000Z",
  requestedStaffMemberId?: string,
) => ({
  barbershopSlug: fixture.shop.slug,
  serviceId: fixture.service.id,
  requestedStaffMemberId,
  startsAt,
  customer: {
    name: "  Maria Cliente  ",
    phone: "  +34 600 123 456  ",
    email: "  MARIA@EXAMPLE.TEST  ",
  },
})

const createPublic = (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  startsAt = "2030-01-07T09:00:00.000Z",
  requestedStaffMemberId?: string,
  extra?: Parameters<typeof createPublicBooking>[1],
) =>
  createPublicBooking(
    publicInput(fixture, startsAt, requestedStaffMemberId),
    {
      sourceIp: "198.51.100.10",
      clock: bookingClock,
      consumeLimit: allowLimit,
      ...extra,
    },
  )

const lookup = (
  code: string,
  extra?: Parameters<typeof lookupPrivateBooking>[1],
) =>
  lookupPrivateBooking(code, {
    sourceIp: "198.51.100.20",
    consumeLimit: allowLimit,
    ...extra,
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

test("ACTIVE tenant resolves public catalog with active services and safe links", async () => {
  const fixture = await createFixture("catalog")
  await addGeneralChair(fixture.shop.id)
  const inactiveService = await db.service.create({
    data: {
      barbershopId: fixture.shop.id,
      name: "Inactive",
      price: "10.00",
      durationMinutes: 15,
      active: false,
    },
  })

  const catalog = await getPublicCatalog(fixture.shop.slug)
  assert.ok(catalog)
  assert.equal(catalog.name, fixture.shop.name)
  assert.equal(catalog.generalAvailable, true)
  assert.equal(catalog.services.some((service) => service.id === fixture.service.id), true)
  assert.equal(catalog.services.some((service) => service.id === inactiveService.id), false)
  assert.equal(catalog.officialWebsiteUrl, "https://example.test/")
  assert.equal(catalog.instagramUrl, "https://instagram.com/example")
})

test("unsafe external schemes are never rendered as navigable catalog URLs", async () => {
  const fixture = await createFixture("unsafe-links", {
    officialWebsite: "javascript:alert(1)",
    instagram: "data:text/html,unsafe",
  })
  await addGeneralChair(fixture.shop.id)

  const catalog = await getPublicCatalog(fixture.shop.slug)
  assert.ok(catalog)
  assert.equal(catalog.officialWebsiteUrl, null)
  assert.equal(catalog.instagramUrl, null)
  assert.equal(catalog.officialWebsiteLabel, "javascript:alert(1)")
})

test("SUSPENDED and ARCHIVED tenants do not resolve public booking catalog", async () => {
  const suspended = await createFixture("catalog-suspended", {
    status: "SUSPENDED",
  })
  const archived = await createFixture("catalog-archived", {
    status: "ARCHIVED",
  })

  assert.equal(await getPublicCatalog(suspended.shop.slug), null)
  assert.equal(await getPublicCatalog(archived.shop.slug), null)
})

test("WALK_IN never creates a public GENERAL option and active GENERAL does", async () => {
  const fixture = await createFixture("general-option")
  await addWalkInChair(fixture.shop.id, 1)
  await addGeneralChair(fixture.shop.id, 2, false)

  assert.equal((await getPublicCatalog(fixture.shop.slug))?.generalAvailable, false)

  await db.chair.update({
    where: {
      barbershopId_number: {
        barbershopId: fixture.shop.id,
        number: 2,
      },
    },
    data: { active: true },
  })

  assert.equal((await getPublicCatalog(fixture.shop.slug))?.generalAvailable, true)
})

test("only active non-archived professionals with an active STAFF chair are listed", async () => {
  const fixture = await createFixture("staff-catalog")
  const active = await addStaff(fixture.shop.id, 1, { name: "Ana" })
  await addStaff(fixture.shop.id, 2, { name: "Inactive", active: false })
  await addStaff(fixture.shop.id, 3, { name: "Archived", archived: true })
  await addStaff(fixture.shop.id, 4, { name: "Chair Off", chairActive: false })

  const catalog = await getPublicCatalog(fixture.shop.slug)
  assert.ok(catalog)
  assert.deepEqual(catalog.professionals.map((staff) => staff.id), [active.staff.id])
  assert.equal(catalog.professionals[0]?.photoUrl, "https://example.test/staff.jpg")
})

test("public availability resolves tenant from slug and reuses canonical availability", async () => {
  const fixture = await createFixture("availability")
  await addGeneralChair(fixture.shop.id)

  const result = await getPublicAvailability(
    {
      barbershopSlug: fixture.shop.slug,
      serviceId: fixture.service.id,
      localDate: "2030-01-07",
    },
    { clock: availabilityClock },
  )

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.availability.mode, "GENERAL_BOOKING")
    assert.equal(result.availability.slots[0]?.localTime, "08:00")
  }
})

test("successful GENERAL public booking atomically creates Customer Booking and access token", async () => {
  const fixture = await createFixture("create-general")
  await addGeneralChair(fixture.shop.id)

  const result = await createPublic(fixture)
  assert.equal(result.ok, true)
  if (!result.ok) return

  const customers = await db.customer.findMany({
    where: { barbershopId: fixture.shop.id },
  })
  const bookings = await db.booking.findMany({
    where: { barbershopId: fixture.shop.id },
  })
  const tokens = await db.bookingAccessToken.findMany({
    where: { barbershopId: fixture.shop.id },
  })

  assert.equal(customers.length, 1)
  assert.equal(bookings.length, 1)
  assert.equal(tokens.length, 1)
  assert.equal(bookings[0]?.mode, "GENERAL_BOOKING")
  assert.equal(bookings[0]?.staffMemberId, null)
  assert.equal(customers[0]?.name, "Maria Cliente")
  assert.equal(customers[0]?.phone, "+34 600 123 456")
  assert.equal(customers[0]?.email, "maria@example.test")
  assert.equal(bookings[0]?.customerNameSnapshot, "Maria Cliente")
  assert.equal(bookings[0]?.serviceNameSnapshot, fixture.service.name)
  assert.equal(result.accessPath, `/r/${result.accessCode}`)
})

test("successful STAFF public booking uses authoritative identified-professional semantics", async () => {
  const fixture = await createFixture("create-staff")
  const { staff } = await addStaff(fixture.shop.id, 1, { name: "Carlos" })

  const result = await createPublic(
    fixture,
    "2030-01-07T10:00:00.000Z",
    staff.id,
  )
  assert.equal(result.ok, true)

  const booking = await db.booking.findFirst({
    where: { barbershopId: fixture.shop.id },
  })
  assert.ok(booking)
  assert.equal(booking.mode, "STAFF_BOOKING")
  assert.equal(booking.staffMemberId, staff.id)
  assert.equal(booking.staffNameSnapshot, "Carlos")
})

test("no capacity rolls back Customer and access-token side effects", async () => {
  const fixture = await createFixture("atomic-no-capacity")

  const result = await createPublic(fixture)
  assert.deepEqual(result, { ok: false, code: "SLOT_UNAVAILABLE" })
  assert.equal(await db.customer.count({ where: { barbershopId: fixture.shop.id } }), 0)
  assert.equal(await db.booking.count({ where: { barbershopId: fixture.shop.id } }), 0)
  assert.equal(await db.bookingAccessToken.count({ where: { barbershopId: fixture.shop.id } }), 0)
})

test("stale availability conflict rolls back the public Customer and token", async () => {
  const fixture = await createFixture("atomic-stale")
  await addGeneralChair(fixture.shop.id)

  const observed = await getPublicAvailability(
    {
      barbershopSlug: fixture.shop.slug,
      serviceId: fixture.service.id,
      localDate: "2030-01-07",
    },
    { clock: availabilityClock },
  )
  assert.equal(observed.ok, true)
  if (!observed.ok) return
  const slot = observed.availability.slots.find((item) => item.localTime === "09:00")
  assert.ok(slot)

  const existing = await addBlockingCustomer(fixture.shop.id)
  await createBooking(
    {
      barbershopId: fixture.shop.id,
      customerId: existing.id,
      serviceId: fixture.service.id,
      startsAt: slot.startsAt,
    },
    bookingClock,
  )

  const customerCountBefore = await db.customer.count({
    where: { barbershopId: fixture.shop.id },
  })
  const result = await createPublic(fixture, slot.startsAt.toISOString())

  assert.deepEqual(result, { ok: false, code: "SLOT_UNAVAILABLE" })
  assert.equal(
    await db.customer.count({ where: { barbershopId: fixture.shop.id } }),
    customerCountBefore,
  )
  assert.equal(
    await db.bookingAccessToken.count({ where: { barbershopId: fixture.shop.id } }),
    0,
  )
  assert.equal(
    await db.booking.count({ where: { barbershopId: fixture.shop.id } }),
    1,
  )
})

test("invalid Service or Staff rolls back Customer and token", async () => {
  const serviceFixture = await createFixture("invalid-service")
  await addGeneralChair(serviceFixture.shop.id)

  const badService = await createPublicBooking(
    {
      ...publicInput(serviceFixture),
      serviceId: uuid(),
    },
    {
      sourceIp: "198.51.100.30",
      clock: bookingClock,
      consumeLimit: allowLimit,
    },
  )
  assert.deepEqual(badService, { ok: false, code: "SERVICE_UNAVAILABLE" })
  assert.equal(await db.customer.count({ where: { barbershopId: serviceFixture.shop.id } }), 0)

  const staffFixture = await createFixture("invalid-staff")
  await addGeneralChair(staffFixture.shop.id)
  const badStaff = await createPublic(
    staffFixture,
    "2030-01-07T09:00:00.000Z",
    uuid(),
  )
  assert.deepEqual(badStaff, { ok: false, code: "STAFF_UNAVAILABLE" })
  assert.equal(await db.customer.count({ where: { barbershopId: staffFixture.shop.id } }), 0)
  assert.equal(await db.bookingAccessToken.count({ where: { barbershopId: staffFixture.shop.id } }), 0)
})

test("foreign Service and StaffMember cannot cross tenant boundaries", async () => {
  const first = await createFixture("tenant-first")
  const second = await createFixture("tenant-second")
  await addGeneralChair(first.shop.id)
  const foreignStaff = await addStaff(second.shop.id)

  const foreignService = await createPublicBooking(
    {
      ...publicInput(first),
      serviceId: second.service.id,
    },
    {
      sourceIp: "198.51.100.31",
      clock: bookingClock,
      consumeLimit: allowLimit,
    },
  )
  assert.deepEqual(foreignService, { ok: false, code: "SERVICE_UNAVAILABLE" })

  const staffResult = await createPublic(
    first,
    "2030-01-07T10:00:00.000Z",
    foreignStaff.staff.id,
  )
  assert.deepEqual(staffResult, { ok: false, code: "STAFF_UNAVAILABLE" })
  assert.equal(await db.customer.count({ where: { barbershopId: first.shop.id } }), 0)
})

test("slug is the authoritative tenant boundary for public mutation", async () => {
  const first = await createFixture("slug-first")
  const second = await createFixture("slug-second")
  await addGeneralChair(first.shop.id)
  await addGeneralChair(second.shop.id)

  const result = await createPublicBooking(
    {
      ...publicInput(first),
      barbershopSlug: second.shop.slug,
      serviceId: first.service.id,
    },
    {
      sourceIp: "198.51.100.32",
      clock: bookingClock,
      consumeLimit: allowLimit,
    },
  )

  assert.deepEqual(result, { ok: false, code: "SERVICE_UNAVAILABLE" })
  assert.equal(await db.customer.count({ where: { barbershopId: first.shop.id } }), 0)
  assert.equal(await db.customer.count({ where: { barbershopId: second.shop.id } }), 0)
})

test("raw access code is absent from storage and hash lookup resolves snapshots", async () => {
  const fixture = await createFixture("token-storage")
  await addGeneralChair(fixture.shop.id)

  const result = await createPublic(fixture)
  assert.equal(result.ok, true)
  if (!result.ok) return

  const token = await db.bookingAccessToken.findFirst({
    where: { barbershopId: fixture.shop.id },
  })
  assert.ok(token)
  assert.equal(token.tokenHash, hashAccessCode(result.accessCode))
  assert.equal(token.tokenHash.includes(result.accessCode), false)
  assert.equal(JSON.stringify(token).includes(result.accessCode), false)

  const resolved = await lookup(result.accessCode.toLowerCase())
  assert.equal(resolved.ok, true)
  if (resolved.ok) {
    assert.equal(resolved.booking.serviceName, fixture.service.name)
    assert.equal(resolved.booking.customerName, "Maria Cliente")
    assert.equal(resolved.booking.localDate, "2030-01-07")
    assert.equal(resolved.booking.localTime, "09:00")
  }
})

test("private projection remains snapshot-based after source records change", async () => {
  const fixture = await createFixture("snapshot-private", {
    serviceName: "Original Service",
  })
  await addGeneralChair(fixture.shop.id)
  const result = await createPublic(fixture)
  assert.equal(result.ok, true)
  if (!result.ok) return

  const token = await db.bookingAccessToken.findUnique({
    where: { tokenHash: hashAccessCode(result.accessCode) },
    select: {
      booking: {
        select: {
          customerId: true,
          serviceId: true,
        },
      },
    },
  })
  assert.ok(token)

  await db.service.update({
    where: { id: token.booking.serviceId },
    data: { name: "Changed Service" },
  })
  await db.customer.update({
    where: { id: token.booking.customerId },
    data: { name: "Changed Customer" },
  })

  const privateResult = await lookup(result.accessCode)
  assert.equal(privateResult.ok, true)
  if (privateResult.ok) {
    assert.equal(privateResult.booking.serviceName, "Original Service")
    assert.equal(privateResult.booking.customerName, "Maria Cliente")
  }
})

test("access codes use the expected 8-character human-safe cryptographic alphabet", () => {
  const source = readFileSync("lib/booking-access.ts", "utf8")
  assert.match(source, /randomBytes\(/)
  assert.equal(source.includes("Math.random"), false)

  const code = generateAccessCode()
  assert.equal(code.length, ACCESS_CODE_LENGTH)
  assert.match(code, new RegExp(`^[${ACCESS_CODE_ALPHABET}]{8}$`))
  assert.equal(canonicalizeAccessCode(code.toLowerCase()), code)
})

test("unknown, malformed, revoked and Booking-id inputs share generic private unavailability", async () => {
  const fixture = await createFixture("private-generic")
  await addGeneralChair(fixture.shop.id)
  const result = await createPublic(fixture)
  assert.equal(result.ok, true)
  if (!result.ok) return

  const token = await db.bookingAccessToken.findUnique({
    where: { tokenHash: hashAccessCode(result.accessCode) },
    select: { id: true, bookingId: true },
  })
  assert.ok(token)

  assert.deepEqual(await lookup("ABCDEFG2"), { ok: false, code: "UNAVAILABLE" })
  assert.deepEqual(await lookup("bad"), { ok: false, code: "UNAVAILABLE" })
  assert.deepEqual(await lookup(token.bookingId), { ok: false, code: "UNAVAILABLE" })

  await db.bookingAccessToken.update({
    where: { id: token.id },
    data: { revokedAt: new Date("2030-01-01T00:00:00.000Z") },
  })
  assert.deepEqual(await lookup(result.accessCode), { ok: false, code: "UNAVAILABLE" })
})

test("token collision retries inside the same atomic public booking transaction", async () => {
  const fixture = await createFixture("token-collision")
  await addGeneralChair(fixture.shop.id)

  const first = await createPublic(
    fixture,
    "2030-01-07T09:00:00.000Z",
    undefined,
    { accessCodeGenerator: () => "ABCDEFGH" },
  )
  assert.equal(first.ok, true)

  const candidates = ["ABCDEFGH", "JKLMNPQR"]
  let index = 0
  const second = await createPublic(
    fixture,
    "2030-01-07T10:00:00.000Z",
    undefined,
    {
      accessCodeGenerator: () => candidates[index++] ?? "STUVWXYZ",
    },
  )

  assert.equal(second.ok, true)
  if (second.ok) {
    assert.equal(second.accessCode, "JKLMNPQR")
  }
  assert.equal(await db.customer.count({ where: { barbershopId: fixture.shop.id } }), 2)
  assert.equal(await db.booking.count({ where: { barbershopId: fixture.shop.id } }), 2)
  assert.equal(await db.bookingAccessToken.count({ where: { barbershopId: fixture.shop.id } }), 2)
})

test("database prevents cross-tenant BookingAccessToken references", async () => {
  const first = await createFixture("token-fk-first")
  const second = await createFixture("token-fk-second")
  await addGeneralChair(first.shop.id)
  await addGeneralChair(second.shop.id)

  const firstResult = await createPublic(first)
  assert.equal(firstResult.ok, true)
  const firstBooking = await db.booking.findFirst({
    where: { barbershopId: first.shop.id },
  })
  assert.ok(firstBooking)

  await assert.rejects(() =>
    db.bookingAccessToken.create({
      data: {
        barbershopId: second.shop.id,
        bookingId: firstBooking.id,
        tokenHash: hashAccessCode("QRSTUVWX"),
      },
    }),
  )
})

test("public booking requires no customer authentication identity", () => {
  const parsed = publicBookingInputSchema.safeParse({
    barbershopSlug: "example-shop",
    serviceId: uuid(),
    startsAt: "2030-01-07T09:00:00.000Z",
    customer: {
      name: "No Account",
      phone: "+12025550123",
      email: "",
    },
  })

  assert.equal(parsed.success, true)
  if (parsed.success) {
    assert.equal("userId" in parsed.data.customer, false)
    assert.equal("password" in parsed.data.customer, false)
  }
})

test("public creation rate-limit rejects excessive attempts before Customer creation", async () => {
  const fixture = await createFixture("rate-create")
  await addGeneralChair(fixture.shop.id)

  let attempts = 0
  const oneAllowed = async (_name: RateLimitName, _key: string) => ({
    allowed: ++attempts <= 1,
    retryAfterSeconds: attempts <= 1 ? 0 : 60,
  })

  const first = await createPublic(
    fixture,
    "2030-01-07T09:00:00.000Z",
    undefined,
    { consumeLimit: oneAllowed },
  )
  assert.equal(first.ok, true)

  const second = await createPublic(
    fixture,
    "2030-01-07T10:00:00.000Z",
    undefined,
    { consumeLimit: oneAllowed },
  )
  assert.deepEqual(second, { ok: false, code: "RATE_LIMITED" })
  assert.equal(await db.customer.count({ where: { barbershopId: fixture.shop.id } }), 1)
})

test("private lookup rate-limit allows then safely denies excessive access", async () => {
  const fixture = await createFixture("rate-private")
  await addGeneralChair(fixture.shop.id)
  const created = await createPublic(fixture)
  assert.equal(created.ok, true)
  if (!created.ok) return

  let attempts = 0
  const oneAllowed = async (_name: RateLimitName, _key: string) => ({
    allowed: ++attempts <= 1,
    retryAfterSeconds: attempts <= 1 ? 0 : 60,
  })

  const first = await lookup(created.accessCode, {
    consumeLimit: oneAllowed,
  })
  assert.equal(first.ok, true)

  const second = await lookup(created.accessCode, {
    consumeLimit: oneAllowed,
  })
  assert.deepEqual(second, { ok: false, code: "RATE_LIMITED" })
})

test("public limiter keys hash tenant IP and telephone before persistence", async () => {
  const ip = "203.0.113.244"
  const phone = "+1 202 555 0199"
  const tenant = uuid()
  const key = buildPublicCreateRateLimitKey(tenant, ip, phone)

  assert.equal(key.length, 64)
  assert.equal(key.includes(ip), false)
  assert.equal(key.includes(phone), false)
  assert.equal(buildPrivateLookupRateLimitKey(ip).includes(ip), false)
  assert.equal(RATE_LIMITS.publicBookingCreate.points, 6)
  assert.equal(RATE_LIMITS.privateBookingLookup.points, 20)

  const consumed = await consumeRateLimit("publicBookingCreate", key)
  assert.equal(consumed.allowed, true)

  assert.equal(
    await db.rateLimit.count({
      where: {
        OR: [
          { key: { contains: ip } },
          { key: { contains: phone } },
        ],
      },
    }),
    0,
  )

  await db.rateLimit.deleteMany({
    where: { key: { contains: key } },
  })
})

test("source IP helper treats forwarding headers only as a bounded anti-abuse signal", () => {
  const headers = new Headers({
    "x-forwarded-for": "198.51.100.44, 10.0.0.1",
    "x-real-ip": "198.51.100.99",
  })
  assert.equal(sourceIpFromHeaders(headers), "198.51.100.44")
  assert.equal(sourceIpFromHeaders(new Headers()), "unknown")
})


test("one active access token per Booking is enforced and cancellation preserves access history", async () => {
  const fixture = await createFixture("token-history")
  await addGeneralChair(fixture.shop.id)

  const created = await createPublic(fixture)
  assert.equal(created.ok, true)
  if (!created.ok) return

  const token = await db.bookingAccessToken.findUnique({
    where: { tokenHash: hashAccessCode(created.accessCode) },
    select: { id: true, bookingId: true },
  })
  assert.ok(token)

  await assert.rejects(() =>
    db.bookingAccessToken.create({
      data: {
        barbershopId: fixture.shop.id,
        bookingId: token.bookingId,
        tokenHash: hashAccessCode("UVWXYZ23"),
      },
    }),
  )

  await cancelBookingByCustomer(fixture.shop.id, token.bookingId)

  assert.equal(
    await db.bookingAccessToken.count({
      where: {
        barbershopId: fixture.shop.id,
        bookingId: token.bookingId,
      },
    }),
    1,
  )

  const privateResult = await lookup(created.accessCode)
  assert.equal(privateResult.ok, true)
  if (privateResult.ok) {
    assert.equal(privateResult.booking.status, "CANCELLED_BY_CUSTOMER")
  }
})

test("production access codes are not Booking-id derivatives", async () => {
  const fixture = await createFixture("token-nonderivative")
  await addGeneralChair(fixture.shop.id)

  const first = await createPublic(
    fixture,
    "2030-01-07T09:00:00.000Z",
  )
  const second = await createPublic(
    fixture,
    "2030-01-07T10:00:00.000Z",
  )
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  if (!first.ok || !second.ok) return

  assert.notEqual(first.accessCode, second.accessCode)

  const bookings = await db.booking.findMany({
    where: { barbershopId: fixture.shop.id },
    select: { id: true },
  })

  for (const booking of bookings) {
    const canonicalId = booking.id.replace(/-/g, "").toUpperCase()
    assert.equal(canonicalId.includes(first.accessCode), false)
    assert.equal(canonicalId.includes(second.accessCode), false)
  }

  const source = readFileSync("lib/booking-access.ts", "utf8")
  const generatorStart = source.indexOf("export const generateAccessCode")
  const canonicalizerStart = source.indexOf("export const canonicalizeAccessCode")
  assert.ok(generatorStart >= 0)
  assert.ok(canonicalizerStart > generatorStart)
  const generatorSource = source.slice(generatorStart, canonicalizerStart)
  assert.match(generatorSource, /randomBytes/)
  assert.equal(generatorSource.includes("bookingId"), false)
  assert.equal(generatorSource.includes("customerId"), false)
  assert.equal(generatorSource.includes("Date.now"), false)
})

test("public application surfaces wire canonical availability to booking and keep private page read-only", () => {
  const flow = readFileSync(
    "app/b/[slug]/public-booking-flow.tsx",
    "utf8",
  )
  const publicPage = readFileSync("app/b/[slug]/page.tsx", "utf8")
  const privatePage = readFileSync("app/r/[code]/page.tsx", "utf8")

  assert.match(flow, /\/availability/)
  assert.match(flow, /\/bookings/)
  assert.match(flow, /router\.push\(payload\.accessPath\)/)
  assert.match(flow, /name="name"/)
  assert.match(flow, /name="phone"/)
  assert.match(flow, /name="email"/)
  assert.match(publicPage, /getPublicCatalog/)
  assert.match(privatePage, /lookupPrivateBooking/)
  assert.match(privatePage, /index:\s*false/)
  assert.match(privatePage, /follow:\s*false/)
  assert.match(privatePage, /dynamic = "force-dynamic"/)
  assert.match(
    privatePage,
    /Guarda este acesso para cancelar ou remarcar a tua marcação/,
  )
  assert.equal(privatePage.includes("cancelBookingByCustomer"), false)
  assert.equal(privatePage.includes("rescheduleBooking"), false)
})

import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, test } from "node:test"
import { db, getPool } from "../lib/prisma"
import { createBooking, BookingEngineError } from "../lib/booking-engine"
import { getAvailability } from "../lib/availability"
import {
  addStaffScheduleBlock, updateStaffWeeklyHour, StaffPlanningError,
} from "../lib/staff-planning"
import { staffSlotAllowed } from "../lib/staff-schedule"

const owned: string[] = []
const begin = new Date("2030-01-07T09:00:00.000Z")
const end = new Date("2030-01-07T09:30:00.000Z")
const clock = { now: () => new Date("2029-01-01T00:00:00.000Z") }

const fixture = async (tag: string) => {
  const shop = await db.barbershop.create({
    data: {
      name: "Staff Schedule " + tag,
      slug: "test-staff-planning-" + randomUUID().replace(/-/g, "").slice(0, 12),
      timezone: "UTC", status: "ACTIVE",
    },
  })
  owned.push(shop.id)
  const staff = await db.staffMember.create({
    data: { barbershopId: shop.id, name: "Barbeiro de Teste" },
  })
  await db.openingHour.create({
    data: {
      barbershopId: shop.id, weekday: 0,
      isClosed: false, opensAt: 540, closesAt: 1080,
    },
  })
  await db.chair.create({
    data: { barbershopId: shop.id, staffMemberId: staff.id, number: 1, mode: "STAFF_BOOKING" },
  })
  const service = await db.service.create({
    data: { barbershopId: shop.id, name: "Corte", price: "15.00", durationMinutes: 30 },
  })
  const customer = await db.customer.create({
    data: { barbershopId: shop.id, name: "Cliente de Teste", phone: "+351911111111",
      email: "cliente.planning@example.test" },
  })
  return {
    shop, staff, service, customer,
    scope: {
      shop: { id: shop.id, slug: shop.slug, name: shop.name, status: shop.status },
      userId: randomUUID(), role: "STAFF" as const,
      staffMember: { id: staff.id, name: staff.name },
    },
  }
}

after(async () => {
  if (owned.length) {
    const where = { barbershopId: { in: owned } }
    await db.staffInvitation.deleteMany({ where })
    await db.staffScheduleBlock.deleteMany({ where })
    await db.staffWeeklyHour.deleteMany({ where })
    await db.bookingEmailOutbox.deleteMany({ where })
    await db.bookingAccessToken.deleteMany({ where })
    await db.booking.deleteMany({ where })
    await db.customer.deleteMany({ where })
    await db.chair.deleteMany({ where })
    await db.service.deleteMany({ where })
    await db.openingHour.deleteMany({ where })
    await db.staffMember.deleteMany({ where })
    await db.barbershop.deleteMany({ where: { id: { in: owned } } })
  }
  await db.$disconnect()
  await getPool().end()
})

test("blocked lunch time affects public availability AND transactional staff booking", async () => {
  const f = await fixture("blocks")
  await addStaffScheduleBlock(f.scope, {
    localDate: "2030-01-07", fullDay: false,
    opensAt: "09:00", closesAt: "09:30", label: "Pausa",
  })
  const available = await getAvailability({
    barbershopId: f.shop.id, serviceId: f.service.id,
    requestedStaffMemberId: f.staff.id, localDate: "2030-01-07",
  }, { clock })
  assert.equal(available.slots.some(s => s.startsAt.getTime() === begin.getTime()), false)
  assert.equal(await db.$transaction(tx =>
    staffSlotAllowed(tx, f.shop.id, f.staff.id, "UTC", begin, end)), false)
  await assert.rejects(
    () => createBooking({
      barbershopId: f.shop.id, customerId: f.customer.id,
      serviceId: f.service.id, startsAt: begin,
      requestedStaffMemberId: f.staff.id,
    }, clock),
    (error: unknown) => {
      assert.ok(error instanceof BookingEngineError)
      assert.equal(error.code, "NO_CAPACITY")
      return true
    },
  )
})

test("an accepted booking cannot be silently erased by setting a new holiday", async () => {
  const f = await fixture("future")
  await createBooking({
    barbershopId: f.shop.id, customerId: f.customer.id,
    serviceId: f.service.id, startsAt: begin,
    requestedStaffMemberId: f.staff.id,
  }, clock)
  await assert.rejects(
    () => addStaffScheduleBlock(f.scope, {
      localDate: "2030-01-07", fullDay: true,
      opensAt: "09:00", closesAt: "18:00", label: "Folga",
    }),
    (error: unknown) => {
      assert.ok(error instanceof StaffPlanningError)
      assert.equal(error.code, "HAS_BOOKINGS")
      return true
    },
  )
  assert.equal(await db.staffScheduleBlock.count({ where: { barbershopId: f.shop.id } }), 0)
  await assert.rejects(
    () => updateStaffWeeklyHour(f.scope, {
      weekday: 0, defaultHours: false,
      isClosed: true, opensAt: "", closesAt: "",
    }),
    (error: unknown) => {
      assert.ok(error instanceof StaffPlanningError)
      assert.equal(error.code, "HAS_BOOKINGS")
      return true
    },
  )
  assert.equal(await db.staffWeeklyHour.count({ where: { barbershopId: f.shop.id } }), 0)
})

test("business and professional calendars remain independent between tenants", async () => {
  const a = await fixture("tenant-a")
  const b = await fixture("tenant-b")
  await addStaffScheduleBlock(a.scope, {
    localDate: "2030-01-07", fullDay: false,
    opensAt: "09:00", closesAt: "09:30", label: "Pausa A",
  })
  assert.equal(await db.staffScheduleBlock.count({ where: { barbershopId: a.shop.id } }), 1)
  assert.equal(await db.staffScheduleBlock.count({ where: { barbershopId: b.shop.id } }), 0)
  assert.equal(await db.$transaction(tx =>
    staffSlotAllowed(tx, b.shop.id, b.staff.id, "UTC", begin, end)), true)
})

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import {
  staffCalendarParts, staffCalendarWeekday, staffScheduleAllows,
  parseMinuteString, minuteString,
} from "../lib/staff-schedule"
import { manualStaffBookingSchema } from "../lib/staff-bookings"

const source = (path: string) => readFileSync(path, "utf8")

test("professional hours are strictly scoped and overlap-aware", () => {
  const schedule = {
    weekday: 0, isClosed: false, opensAt: 9 * 60, closesAt: 18 * 60,
    blocks: [{ startsMinute: 12 * 60, endsMinute: 13 * 60 }],
  }
  assert.equal(staffScheduleAllows(schedule, 9 * 60, 9 * 60 + 30), true)
  assert.equal(staffScheduleAllows(schedule, 8 * 60 + 45, 9 * 60 + 15), false)
  assert.equal(staffScheduleAllows(schedule, 11 * 60 + 45, 12 * 60 + 15), false)
  assert.equal(staffScheduleAllows(schedule, 13 * 60, 13 * 60 + 30), true)
  assert.equal(staffScheduleAllows(schedule, 17 * 60 + 45, 18 * 60 + 15), false)
  assert.equal(staffScheduleAllows({ ...schedule, isClosed: true }, 10 * 60, 11 * 60), false)
})

test("Portuguese local date/weekdays and minute grid respect tenant timezone", () => {
  assert.equal(staffCalendarWeekday("2026-10-19"), 0)
  assert.equal(staffCalendarWeekday("2026-10-18"), 6)
  assert.equal(staffCalendarParts(new Date("2026-10-18T11:00:00Z"), "Europe/Lisbon").minute, 720)
  assert.equal(staffCalendarParts(new Date("2026-12-18T11:00:00Z"), "Europe/Lisbon").minute, 660)
  assert.equal(parseMinuteString("09:15"), 555)
  assert.equal(parseMinuteString("09:12"), null)
  assert.equal(parseMinuteString("25:00"), null)
  assert.equal(minuteString(1440), "24:00")
})

test("manual booking rejects missing email and arbitrary client-side service identifiers", () => {
  const input = {
    serviceId: "123e4567-e89b-42d3-a456-426614174000",
    startsAt: "2030-05-20T09:00:00.000Z",
    customer: { name: "Cliente Teste", phone: "+351 912 345 678", email: "cliente@example.test" },
  }
  assert.equal(manualStaffBookingSchema.safeParse(input).success, true)
  assert.equal(manualStaffBookingSchema.safeParse({
    ...input, customer: { ...input.customer, email: "" },
  }).success, false)
  assert.equal(manualStaffBookingSchema.safeParse({
    ...input, serviceId: "../outra-barbearia",
  }).success, false)
})

test("staff bookings use the common transactional engine and protect private links", () => {
  const booking = source("lib/staff-bookings.ts")
  const engine = source("lib/booking-engine.ts")
  const availability = source("lib/availability.ts")
  assert.match(booking, /bookingEmailReadyForTenant\(scope\.shop\.slug\)/)
  assert.match(booking, /createBookingInTransaction\(tx/)
  assert.match(booking, /issueBookingAccessToken\(tx/)
  assert.match(booking, /sealBookingEmail\(/)
  assert.match(booking, /await deliverBookingEmail\(result\.notificationId\)/)
  assert.match(booking, /scope\.staffMember\.id/)
  assert.match(engine, /staffSlotAllowed\(/)
  assert.match(engine, /current\.staffMemberId !== expectedStaffMemberId/)
  assert.match(engine, /booking\.staffMemberId !== expectedStaffMemberId/)
  assert.match(availability, /staffScheduleAllows\(staffSchedule/)
  assert.match(booking, /scope\.staffMember\.id/)
  assert.doesNotMatch(booking, /console\.log|password|process\.stdout/)
})

test("absence writes use the same tenant advisory lock and refuse booked periods", () => {
  const planning = source("lib/staff-planning.ts")
  const actions = source("app/(admin)/admin/[slug]/barbeiro/actions.ts")
  assert.match(planning, /acquireTenantBookingLock\(tx, scope\.shop\.id\)/)
  assert.match(planning, /barbershopId: scope\.shop\.id, staffMemberId: scope\.staffMember\.id/)
  assert.match(planning, /HAS_BOOKINGS/)
  assert.match(planning, /requireBarbershopBySlug\(slug, \["OWNER", "ADMIN", "STAFF"\]\)/)
  for (const action of [
    "createBarberBookingAction", "rescheduleBarberBookingAction",
    "cancelBarberBookingAction", "finishBarberBookingAction",
    "setBarberWeeklyHourAction", "addBarberBlockAction", "removeBarberBlockAction",
  ]) assert.match(actions, new RegExp("export async function " + action))
  assert.match(actions, /consumeRateLimit\(/)
})

test("employee invitations cannot silently create shared or privileged logins", () => {
  const invite = source("lib/staff-invitations.ts")
  const create = source("app/(admin)/admin/[slug]/professionals/convites/actions.ts")
  assert.match(invite, /randomBytes\(32\)\.toString\("base64url"\)/)
  assert.match(invite, /tokenHash\(secret\)/)
  assert.match(invite, /redeemedAt: null, revokedAt: null/)
  assert.match(invite, /claimed\.count !== 1/)
  assert.match(invite, /existingUser\.id !== currentUserId/)
  assert.match(invite, /platformRole: "USER"/)
  assert.match(invite, /tx\.staffMember\.update\(/)
  assert.match(invite, /await hashPassword\(parsed\.data\)/)
  assert.match(create, /requireStaffScope|issueStaffInvitation/)
  assert.doesNotMatch(invite, /console\.log/)
})

test("all operational panels distinguish their access and role boundaries", () => {
  const dashboard = source("app/(admin)/admin/[slug]/barbeiro/page.tsx")
  const planner = source("app/(admin)/admin/[slug]/barbeiro/planeamento/page.tsx")
  const reschedule = source("app/(admin)/admin/[slug]/barbeiro/remarcar/[bookingId]/page.tsx")
  assert.match(dashboard, /staffMemberId: professional\.id/)
  assert.match(planner, /requireStaffScope\(slug, query\.professional\)/)
  assert.match(reschedule, /staffMemberId: scope\.staffMember\.id/)
  assert.match(planner, /bookingEmailReadyForTenant\(slug\)/)
  assert.match(planner, /addBarberBlockAction/)
  assert.match(reschedule, /getBookingRescheduleAvailability/)
  assert.doesNotMatch(planner, /GMAIL_TOKEN_ENCRYPTION_SECRET|NEXTAUTH_SECRET/)
})

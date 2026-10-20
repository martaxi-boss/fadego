import assert from "node:assert/strict"
import { test } from "node:test"
import {
  adjacentAgendaDate,
  agendaDates,
  agendaDisplayInterval,
  agendaEventLanes,
  agendaLocalMinute,
  agendaUtcSearchWindow,
  isValidAgendaDate,
  localAgendaDate,
  resolveAgendaTimezone,
  resolveAgendaProfessionalFilter,
} from "../lib/admin-agenda"

test("agenda accepts only real ISO calendar dates", () => {
  for (const candidate of ["2026-10-16", "2028-02-29", "2026-03-29"]) {
    assert.equal(isValidAgendaDate(candidate), true)
  }
  for (const candidate of ["2026-02-29", "2026-13-01", "2026-00-10", "2026-1-1", "", "../etc"]) {
    assert.equal(isValidAgendaDate(candidate), false)
  }
  assert.equal(isValidAgendaDate(null), false)
})

test("weekly agenda starts on Monday and crosses year/leap-day boundaries", () => {
  assert.deepEqual(agendaDates("2027-01-03", "week"), [
    "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03",
  ])
  assert.equal(agendaDates("2028-03-01", "week")[1], "2028-02-29")
  assert.deepEqual(agendaDates("2026-10-20", ["week"]), ["2026-10-20"])
  const window = agendaUtcSearchWindow("2026-10-19", 7)
  assert.equal(window.gte.toISOString(), "2026-10-18T00:00:00.000Z")
  assert.equal(window.lt.toISOString(), "2026-10-27T00:00:00.000Z")
  for (const days of [0, 8, 1.5, NaN]) assert.throws(() => agendaUtcSearchWindow("2026-10-19", days))
})

test("calendar placement uses tenant-local minutes, including midnight", () => {
  assert.equal(agendaLocalMinute(new Date("2026-10-20T23:00:00Z"), "Europe/Lisbon"), 0)
  assert.equal(agendaLocalMinute(new Date("2026-10-20T09:15:00Z"), "Europe/Lisbon"), 615)
  assert.equal(agendaLocalMinute(new Date("2026-10-25T01:30:00Z"), "Europe/Lisbon"), 90)
})

test("simultaneous appointments have separate lanes; touching appointments reuse lanes", () => {
  const booking = (id: string, start: string, end: string) => ({ id,
    startsAt: new Date("2026-10-20T" + start + ":00Z"), endsAt: new Date("2026-10-20T" + end + ":00Z"),
  })
  const input = [booking("d", "12:00", "12:30"), booking("b", "09:15", "10:00"),
    booking("a", "09:00", "09:30"), booking("c", "09:30", "10:30")]
  const events = agendaEventLanes(input)
  assert.deepEqual(events.map(({ booking, lane, lanes }) => [booking.id, lane, lanes]), [
    ["a", 0, 2], ["b", 1, 2], ["c", 0, 2], ["d", 0, 1],
  ])
  assert.equal(input[0].id, "d", "display layout must not mutate query results")
  assert.deepEqual(agendaEventLanes([]), [])
})

test("repeated Lisbon clock hour keeps a positive calendar appointment height", () => {
  assert.deepEqual(agendaDisplayInterval({ startsAt: new Date("2026-10-25T00:45:00Z"),
    endsAt: new Date("2026-10-25T01:15:00Z") }, "Europe/Lisbon"), { from: 105, to: 135 })
  assert.deepEqual(agendaDisplayInterval({ startsAt: new Date("2026-10-20T22:45:00Z"),
    endsAt: new Date("2026-10-20T23:00:00Z") }, "Europe/Lisbon"), { from: 1425, to: 1440 })
})

test("agenda follows tenant timezone across Lisbon daylight-saving transitions", () => {
  assert.equal(localAgendaDate(new Date("2026-03-29T00:30:00Z"), "Europe/Lisbon"), "2026-03-29")
  assert.equal(localAgendaDate(new Date("2026-10-25T23:30:00Z"), "Europe/Lisbon"), "2026-10-25")
  assert.equal(localAgendaDate(new Date("2026-10-16T23:30:00Z"), "Asia/Tokyo"), "2026-10-17")
  assert.equal(resolveAgendaTimezone("Not/A_Zone"), "UTC")
  assert.equal(resolveAgendaTimezone(null), "UTC")
})

test("agenda UTC search window covers extreme timezone offsets without dropping records", () => {
  const { gte, lt } = agendaUtcSearchWindow("2026-10-16")
  assert.equal(gte.toISOString(), "2026-10-15T00:00:00.000Z")
  assert.equal(lt.toISOString(), "2026-10-18T00:00:00.000Z")
  assert.equal(adjacentAgendaDate("2026-12-31", 1), "2027-01-01")
  assert.equal(adjacentAgendaDate("2026-01-01", -1), "2025-12-31")
  assert.throws(() => agendaUtcSearchWindow("2026-02-30"))
})

test("agenda professional filter accepts only a tenant's listed staff identities", () => {
  const ownStaff = ["d5275916-65a3-46ca-9ea0-7e5a3e492cee"]
  assert.equal(resolveAgendaProfessionalFilter("GENERAL", ownStaff), "GENERAL")
  assert.equal(resolveAgendaProfessionalFilter("ALL", ownStaff), "ALL")
  assert.equal(resolveAgendaProfessionalFilter(ownStaff[0], ownStaff), ownStaff[0])
  assert.equal(resolveAgendaProfessionalFilter("6e73b45b-e885-476d-94a9-15e99a7350cf", ownStaff), "ALL")
  assert.equal(resolveAgendaProfessionalFilter(["GENERAL"], ownStaff), "ALL")
  assert.equal(resolveAgendaProfessionalFilter(undefined, ownStaff), "ALL")
})


import assert from "node:assert/strict"
import { test } from "node:test"
import {
  adjacentAgendaDate,
  agendaUtcSearchWindow,
  isValidAgendaDate,
  localAgendaDate,
  resolveAgendaTimezone,
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

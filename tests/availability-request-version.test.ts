import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { AvailabilityRequestVersion } from "../lib/availability-request-version"

test("a new availability request makes older responses stale", () => {
  const guard = new AvailabilityRequestVersion()
  const first = guard.begin()
  assert.equal(guard.isCurrent(first), true)
  const second = guard.begin()
  assert.equal(guard.isCurrent(first), false)
  assert.equal(guard.isCurrent(second), true)
  guard.invalidate()
  assert.equal(guard.isCurrent(second), false)
  const third = guard.begin()
  assert.equal(guard.isCurrent(third), true)
  assert.equal(guard.isCurrent(0), false)
})

test("public and private booking flows guard against stale availability responses", () => {
  for (const path of [
    "app/b/[slug]/public-booking-flow.tsx",
    "app/r/[code]/private-booking-controls.tsx",
  ]) {
    const source = readFileSync(path, "utf8")
    assert.match(source, /availabilityRequests\.current\.begin\(\)/)
    assert.match(source, /availabilityRequests\.current\.isCurrent\(version\)/)
    assert.match(source, /availabilityRequests\.current\.invalidate\(\)/)
  }
})

test("private slot-conflict warning is retained while current availability refreshes", () => {
  const source = readFileSync("app/r/[code]/private-booking-controls.tsx", "utf8")
  assert.match(source, /await loadAvailability\(staleError\)/)
  assert.match(source, /setRescheduleError\(staleNotice \?\? null\)/)
  assert.doesNotMatch(source, /setRescheduleError\(staleError\)\s*await loadAvailability\(\)/)
})

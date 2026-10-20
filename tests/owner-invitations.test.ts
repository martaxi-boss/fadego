import assert from "node:assert/strict"
import { test } from "node:test"
import { ownerCanBeInvited, ownerInviteTokenValid } from "../lib/owner-invitation-policy"

test("owner invitation cannot reactivate revoked, suspended or privileged identities", () => {
  const member = { role: "OWNER", active: false, revokedAt: null,
    user: { active: false, platformRole: "USER", onboardingPending: true, email: "owner@example.test" } }
  assert.equal(ownerCanBeInvited(member), true)
  assert.equal(ownerCanBeInvited({ ...member, user: { ...member.user, active: true, onboardingPending: false } }), true)
  assert.equal(ownerCanBeInvited(null), false)
  assert.equal(ownerCanBeInvited({ ...member, role: "STAFF" }), false)
  assert.equal(ownerCanBeInvited({ ...member, role: "ADMIN" }), false)
  assert.equal(ownerCanBeInvited({ ...member, active: true }), false)
  assert.equal(ownerCanBeInvited({ ...member, revokedAt: new Date() }), false)
  assert.equal(ownerCanBeInvited({ ...member, user: { ...member.user, onboardingPending: false } }), false)
  assert.equal(ownerCanBeInvited({ ...member, user: { ...member.user, platformRole: "SUPER_ADMIN" } }), false)
})

test("owner invitation tokens reject malformed values and URL manipulation", () => {
  assert.equal(ownerInviteTokenValid("a".repeat(43)), true)
  for (const token of ["", "a".repeat(42), "a".repeat(44), "../login", "a".repeat(42) + "%"]) {
    assert.equal(ownerInviteTokenValid(token), false)
  }
})

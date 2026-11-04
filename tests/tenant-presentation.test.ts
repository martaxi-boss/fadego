import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { canViewCustomerContactDetails } from "../lib/tenant-presentation"

test("customer contact details are visible only to tenant managers", () => {
  assert.equal(canViewCustomerContactDetails("OWNER"), true)
  assert.equal(canViewCustomerContactDetails("ADMIN"), true)
  assert.equal(canViewCustomerContactDetails("STAFF"), false)
})

test("both Club and agenda mask contact fields for non-managers", () => {
  const club = readFileSync("app/(admin)/admin/[slug]/club/membership-section.tsx", "utf8")
  const agenda = readFileSync("app/(admin)/admin/[slug]/agenda/page.tsx", "utf8")
  assert.match(club, /canViewCustomerContactDetails\(role\)/)
  assert.match(club, /canManage \? db\.customer\.findMany/)
  assert.match(club, /\{canViewContacts \? \(\s*<p[\s\S]*?membership\.customer\.phone/)
  assert.match(agenda, /canViewCustomerContactDetails\(access\.membership\.role\)/)
  assert.match(agenda, /\{canViewContacts \? \(\s*<p[\s\S]*?booking\.customerPhoneSnapshot/)
})

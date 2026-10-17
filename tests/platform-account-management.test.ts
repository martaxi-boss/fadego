import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import {
  canActivatePlatformShop, createPlatformShopSchema, editPlatformShopSchema,
  linkPlatformMemberSchema, platformMemberAccessSchema, platformShopStatusSchema,
} from "../lib/platform-account-policy"

const example = {
  name: "Barbearia Piloto", slug: "barbearia-piloto",
  ownerEmail: " OWNER@EXAMPLE.TEST ", contactEmail: "",
}

test("platform account validation normalizes identities and rejects invalid tenant IDs", () => {
  const parsed = createPlatformShopSchema.safeParse(example)
  assert.equal(parsed.success, true)
  if (parsed.success) {
    assert.equal(parsed.data.ownerEmail, "owner@example.test")
    assert.equal(parsed.data.contactEmail, null)
  }
  for (const slug of ["../admin", "Uppercase", "", "-barbearia", "a".repeat(64)]) {
    assert.equal(createPlatformShopSchema.safeParse({ ...example, slug }).success, false)
  }
  for (const ownerEmail of ["", "invalid", "a".repeat(255)]) {
    assert.equal(createPlatformShopSchema.safeParse({ ...example, ownerEmail }).success, false)
  }
  assert.equal(editPlatformShopSchema.safeParse({ name: "", contactEmail: "" }).success, false)
  assert.equal(platformShopStatusSchema.safeParse("ARCHIVED").success, false)
})

test("activation requires an active owner and minimum shop configuration", () => {
  for (const input of [[0, 1, 1, 1], [1, 0, 1, 1], [1, 1, 0, 1], [1, 1, 1, 0]]) {
    assert.equal(canActivatePlatformShop(...(input as [number, number, number, number])), false)
  }
  assert.equal(canActivatePlatformShop(1, 1, 1, 1), true)
})

test("tenant roles cannot grant platform-wide administrator rights", () => {
  assert.equal(linkPlatformMemberSchema.safeParse({ email: "a@example.test", role: "OWNER" }).success, true)
  assert.equal(linkPlatformMemberSchema.safeParse({ email: "a@example.test", role: "SUPER_ADMIN" }).success, false)
  assert.equal(platformMemberAccessSchema.parse("true"), true)
  assert.equal(platformMemberAccessSchema.parse("false"), false)
  assert.equal(platformMemberAccessSchema.safeParse("1").success, false)
})

test("only the platform admin can manage accounts and onboarding is fail-closed", () => {
  const actions = readFileSync("app/(super-admin)/super-admin/actions.ts", "utf8")
  const service = readFileSync("lib/platform-account-management.ts", "utf8")
  const details = readFileSync("app/(super-admin)/super-admin/barbearias/[id]/page.tsx", "utf8")
  assert.match(actions, /await requireSuperAdmin\(\)/)
  assert.match(actions, /consumeRateLimit\(/)
  assert.match(service, /randomBytes\(48\)/)
  assert.match(service, /active: false/)
  assert.match(service, /status: "SUSPENDED"/)
  assert.match(service, /role: "OWNER"/)
  assert.match(service, /LAST_OWNER/)
  assert.match(details, /await requireSuperAdmin\(\)/)
})

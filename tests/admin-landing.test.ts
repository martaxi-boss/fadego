import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

test("platform super-admin receives a distinct launch point to the protected platform dashboard", () => {
  const landing = readFileSync("app/(admin)/admin/page.tsx", "utf8")
  const platformLayout = readFileSync("app/(super-admin)/super-admin/layout.tsx", "utf8")
  assert.match(landing, /user\.platformRole === "SUPER_ADMIN"/)
  assert.match(landing, /isSuperAdmin \? \(/)
  assert.match(landing, /href="\/super-admin"/)
  assert.match(platformLayout, /await requireSuperAdmin\(\)/)
  assert.match(landing, /memberships\.length === 0 && !isSuperAdmin/)
})

test("tenant links remain scoped to the user's active memberships", () => {
  const landing = readFileSync("app/(admin)/admin/page.tsx", "utf8")
  assert.match(landing, /requireAuthenticatedActiveUser\(\)/)
  assert.match(landing, /userId: user\.id/)
  assert.match(landing, /active: true/)
  assert.match(landing, /revokedAt: null/)
})

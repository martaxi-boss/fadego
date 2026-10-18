import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

test("the customer directory denies STAFF on the server without leaking an internal error", () => {
  const source = readFileSync("app/(admin)/admin/[slug]/customers/page.tsx", "utf8")
  assert.match(source, /requireBarbershopBySlug\(slug, \["OWNER", "ADMIN"\]\)/)
  assert.match(source, /if \(error instanceof AuthorizationError\) notFound\(\)/)
})

test("the browser rehearsal covers owner membership, STAFF individual-booking isolation and tenant separation", () => {
  const script = readFileSync("scripts/ci-e2e-multitenant.cjs", "utf8")
  assert.match(script, /ci-staff-north@fadego\.example/)
  assert.match(script, /assertNoPrivateCustomer/)
  assert.match(script, /STAFF dashboard excludes other clients/)
  assert.match(script, /STAFF individual panel must never expose customer contacts/)
  assert.match(script, /response\.status\(\), 404/)
  assert.match(script, /STAFF full agenda must redirect to the scoped individual panel/)
})

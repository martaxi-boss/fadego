import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

test("the customer directory denies STAFF on the server without leaking an internal error", () => {
  const source = readFileSync("app/(admin)/admin/[slug]/customers/page.tsx", "utf8")
  assert.match(source, /requireBarbershopBySlug\(slug, \["OWNER", "ADMIN"\]\)/)
  assert.match(source, /if \(error instanceof AuthorizationError\) notFound\(\)/)
})

test("the browser rehearsal covers owner membership, STAFF contact masking and tenant separation", () => {
  const script = readFileSync("scripts/ci-e2e-multitenant.cjs", "utf8")
  assert.match(script, /ci-staff-north@fadego\.example/)
  assert.match(script, /assertNoPrivateCustomer/)
  assert.match(script, /STAFF agenda must redact phone/)
  assert.match(script, /STAFF Club must redact phone/)
  assert.match(script, /response\.status\(\), 404/)
})

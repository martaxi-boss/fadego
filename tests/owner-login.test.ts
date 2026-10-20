import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { authenticateSingleOwner, ownerPortalPasswordSchema } from "../lib/owner-login-policy"

const record = {
  id: "owner-id", name: "Owner", email: "owner@example.test",
  passwordHash: "fake-test-hash", active: true,
}
const verify = async (candidate: string, hash: string) =>
  candidate === "strong-test-password" && hash === "fake-test-hash"

test("owner portal password policy refuses missing, duplicate or disabled super admins", async () => {
  assert.equal(await authenticateSingleOwner([], "strong-test-password", verify), null)
  assert.equal(await authenticateSingleOwner([record, { ...record, id: "another" }],
    "strong-test-password", verify), null)
  assert.equal(await authenticateSingleOwner([{ ...record, active: false }],
    "strong-test-password", verify), null)
  assert.equal(await authenticateSingleOwner([record], "incorrect", verify), null)
  assert.deepEqual(await authenticateSingleOwner([record], "strong-test-password", verify), {
    id: record.id, name: record.name, email: record.email,
  })
})

test("password-only portal takes no user-supplied identity and keeps staff credentials separate", () => {
  assert.equal(ownerPortalPasswordSchema.safeParse({ password: "" }).success, false)
  assert.equal(ownerPortalPasswordSchema.safeParse({ password: "valid" }).success, true)
  assert.equal(ownerPortalPasswordSchema.safeParse({ password: "x".repeat(513) }).success, false)
  const auth = readFileSync("lib/auth.ts", "utf8")
  const page = readFileSync("app/login/page.tsx", "utf8")
  const ownerForm = readFileSync("app/login/owner-login-form.tsx", "utf8")
  assert.match(auth, /id: "owner-password"/)
  assert.match(auth, /platformRole: "SUPER_ADMIN", active: true/)
  assert.match(auth, /take: 2/)
  assert.match(auth, /hashRateLimitKey\("portal-owner-password"\)/)
  assert.match(page, /staffMode \? <LoginForm \/> : <OwnerLoginForm \/>/)
  assert.match(ownerForm, /signIn\("owner-password"/)
  assert.match(ownerForm, /autoComplete="current-password"/)
  assert.doesNotMatch(ownerForm, /name="email"|name="username"/)
  assert.doesNotMatch(ownerForm, /localStorage|sessionStorage|document[.]cookie/)
})

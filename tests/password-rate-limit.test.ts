import assert from "node:assert/strict"
import test from "node:test"
import { hashPassword, verifyPassword } from "../lib/password"
import { hashRateLimitKey } from "../lib/rate-limit"

test("administrative passwords are stored as salted scrypt hashes", async () => {
  const password = "synthetic-passphrase-123"
  const encoded = await hashPassword(password)

  assert.match(encoded, /^scrypt\$/)
  assert.equal(encoded.includes(password), false)
  assert.equal(await verifyPassword(password, encoded), true)
  assert.equal(await verifyPassword("wrong-passphrase", encoded), false)
})

test("authentication rate-limit key does not expose the principal", () => {
  const email = "admin@example.test"
  const key = hashRateLimitKey("admin-login", email)

  assert.equal(key.includes(email), false)
  assert.equal(key.length, 64)
})

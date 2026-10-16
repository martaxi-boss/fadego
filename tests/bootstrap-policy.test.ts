import assert from "node:assert/strict"
import { test } from "node:test"
import { bootstrapAdminConfigSchema } from "../lib/bootstrap-policy"

test("bootstrap requires a strong password, valid email and bounded name", () => {
  const valid = bootstrapAdminConfigSchema.safeParse({
    email: "  ADMIN@EXAMPLE.TEST ",
    password: "an-example-passphrase-with-length",
    name: "  Administrador  ",
  })
  assert.equal(valid.success, true)
  if (valid.success) {
    assert.equal(valid.data.email, "admin@example.test")
    assert.equal(valid.data.name, "Administrador")
  }
  for (const password of ["short", "", "a".repeat(257)]) {
    assert.equal(bootstrapAdminConfigSchema.safeParse({
      email: "admin@example.test",
      password,
      name: "Administrador",
    }).success, false)
  }
  assert.equal(bootstrapAdminConfigSchema.safeParse({
    email: "invalid-address",
    password: "a very long password",
    name: "Administrador",
  }).success, false)
})

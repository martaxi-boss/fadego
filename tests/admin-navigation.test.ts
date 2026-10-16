import assert from "node:assert/strict"
import { test } from "node:test"
import { TENANT_ADMIN_MODULES, tenantModulesForRole } from "../lib/admin-navigation"

test("overview cards and navigation share the same canonical module list", () => {
  const all = tenantModulesForRole("OWNER")
  assert.equal(all.length, TENANT_ADMIN_MODULES.length)
  assert.deepEqual(
    all.map((module) => module.href),
    ["agenda", "customers", "professionals", "chairs", "services", "hours", "club"],
  )
  assert.equal(new Set(all.map((module) => module.href)).size, all.length)
})

test("staff navigation never exposes manager-only customer directory", () => {
  const staffModules = tenantModulesForRole("STAFF")
  assert.equal(staffModules.some((module) => module.href === "customers"), false)
  assert.equal(staffModules.some((module) => module.href === "agenda"), true)
  for (const role of ["OWNER", "ADMIN"] as const) {
    assert.equal(tenantModulesForRole(role).some((module) => module.href === "customers"), true)
  }
})

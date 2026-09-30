import assert from "node:assert/strict"
import test from "node:test"
import {
  AuthorizationError,
  requireTenantMembershipIdentity,
  type AccessMembership,
  type AccessRepository,
  type AccessUser,
} from "../lib/access-policy"

const user: AccessUser = {
  id: "staff-user",
  name: "Staff",
  email: "staff@example.test",
  platformRole: "USER",
  active: true,
}

const membership: AccessMembership = {
  id: "staff-membership",
  barbershopId: "shop-a",
  userId: user.id,
  role: "STAFF",
  active: true,
  revokedAt: null,
}

const repository: AccessRepository = {
  async findUserById(userId) {
    return userId === user.id ? user : null
  },
  async findMembership(userId, barbershopId) {
    return userId === user.id && barbershopId === membership.barbershopId
      ? membership
      : null
  },
}

test("STAFF tenant role cannot pass operational configuration write authorization", async () => {
  await assert.rejects(
    () =>
      requireTenantMembershipIdentity(
        user.id,
        membership.barbershopId,
        repository,
        ["OWNER", "ADMIN"],
      ),
    (error: unknown) => {
      assert.ok(error instanceof AuthorizationError)
      assert.equal(error.code, "FORBIDDEN")
      return true
    },
  )
})

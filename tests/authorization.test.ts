import assert from "node:assert/strict"
import test from "node:test"
import {
  AuthorizationError,
  requireActiveIdentity,
  requireSuperAdminIdentity,
  requireTenantMembershipIdentity,
  type AccessMembership,
  type AccessRepository,
  type AccessUser,
} from "../lib/access-policy"
import { authenticateCredentialCandidate } from "../lib/credential-policy"

const users = new Map<string, AccessUser>([
  [
    "user-a",
    {
      id: "user-a",
      name: "Admin A",
      email: "a@example.test",
      platformRole: "USER",
      active: true,
    },
  ],
  [
    "inactive",
    {
      id: "inactive",
      name: "Inactive",
      email: "inactive@example.test",
      platformRole: "USER",
      active: false,
    },
  ],
  [
    "super",
    {
      id: "super",
      name: "Super",
      email: "super@example.test",
      platformRole: "SUPER_ADMIN",
      active: true,
    },
  ],
])

const memberships = new Map<string, AccessMembership>([
  [
    "user-a:shop-a",
    {
      id: "membership-a",
      userId: "user-a",
      barbershopId: "shop-a",
      role: "ADMIN",
      active: true,
      revokedAt: null,
    },
  ],
  [
    "user-a:shop-revoked",
    {
      id: "membership-revoked",
      userId: "user-a",
      barbershopId: "shop-revoked",
      role: "ADMIN",
      active: false,
      revokedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
])

const repository: AccessRepository = {
  async findUserById(userId) {
    return users.get(userId) ?? null
  },
  async findMembership(userId, barbershopId) {
    return memberships.get(`${userId}:${barbershopId}`) ?? null
  },
}

const expectAuthCode = async (
  action: () => Promise<unknown>,
  code: "UNAUTHENTICATED" | "FORBIDDEN",
) => {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof AuthorizationError)
    assert.equal(error.code, code)
    return true
  })
}

test("unauthenticated access is rejected", async () => {
  await expectAuthCode(
    () => requireActiveIdentity(null, repository),
    "UNAUTHENTICATED",
  )
})

test("inactive administrative identity is rejected", async () => {
  await expectAuthCode(
    () => requireActiveIdentity("inactive", repository),
    "FORBIDDEN",
  )
})

test("member of Barbershop A cannot authorize for Barbershop B", async () => {
  await expectAuthCode(
    () =>
      requireTenantMembershipIdentity(
        "user-a",
        "shop-b",
        repository,
        ["OWNER", "ADMIN"],
      ),
    "FORBIDDEN",
  )
})

test("active membership authorizes only its own tenant and allowed role", async () => {
  const access = await requireTenantMembershipIdentity(
    "user-a",
    "shop-a",
    repository,
    ["OWNER", "ADMIN"],
  )

  assert.equal(access.membership.barbershopId, "shop-a")
  assert.equal(access.user.id, "user-a")
})

test("revoked membership is rejected without deleting identity", async () => {
  await expectAuthCode(
    () =>
      requireTenantMembershipIdentity(
        "user-a",
        "shop-revoked",
        repository,
        ["ADMIN"],
      ),
    "FORBIDDEN",
  )
  assert.equal(users.get("user-a")?.active, true)
})

test("super-admin boundary requires active SUPER_ADMIN role", async () => {
  const user = await requireSuperAdminIdentity("super", repository)
  assert.equal(user.platformRole, "SUPER_ADMIN")

  await expectAuthCode(
    () => requireSuperAdminIdentity("user-a", repository),
    "FORBIDDEN",
  )
})

test("inactive credential record is rejected generically before verification", async () => {
  let verifyCalled = false

  const result = await authenticateCredentialCandidate(
    {
      id: "inactive",
      name: "Inactive",
      email: "inactive@example.test",
      passwordHash: "opaque",
      active: false,
    },
    "candidate-password",
    async () => {
      verifyCalled = true
      return true
    },
  )

  assert.equal(result, null)
  assert.equal(verifyCalled, false)
})

test("invalid credential password returns the same null outcome", async () => {
  const result = await authenticateCredentialCandidate(
    {
      id: "user-a",
      name: "Admin A",
      email: "a@example.test",
      passwordHash: "opaque",
      active: true,
    },
    "wrong-password",
    async () => false,
  )

  assert.equal(result, null)
})

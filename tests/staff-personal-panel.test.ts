import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { isLinkableStaffIdentity, resolveStaffPanelTarget } from "../lib/staff-panel-policy"

const barberId = "123e4567-e89b-42d3-a456-426614174000"

test("STAFF can never choose another professional from a URL", () => {
  assert.deepEqual(resolveStaffPanelTarget("STAFF", "my-user", barberId),
    { mode: "own", userId: "my-user" })
  assert.deepEqual(resolveStaffPanelTarget("STAFF", "my-user", null),
    { mode: "own", userId: "my-user" })
  assert.deepEqual(resolveStaffPanelTarget("OWNER", "owner-user", barberId),
    { mode: "preview", professionalId: barberId })
  assert.deepEqual(resolveStaffPanelTarget("ADMIN", "admin-user", barberId),
    { mode: "preview", professionalId: barberId })
  assert.deepEqual(resolveStaffPanelTarget("OWNER", "owner-user", "unknown"),
    { mode: "choose" })
})

test("a professional login can use only a known active, non-revoked STAFF membership", () => {
  const good = {
    memberRole: "STAFF" as const,
    memberActive: true,
    revokedAt: null,
    userActive: true,
    platformRole: "USER" as const,
  }
  assert.equal(isLinkableStaffIdentity(good), true)
  assert.equal(isLinkableStaffIdentity(null), false)
  assert.equal(isLinkableStaffIdentity({ ...good, memberRole: "OWNER" }), false)
  assert.equal(isLinkableStaffIdentity({ ...good, memberRole: "ADMIN" }), false)
  assert.equal(isLinkableStaffIdentity({ ...good, memberActive: false }), false)
  assert.equal(isLinkableStaffIdentity({ ...good, revokedAt: new Date() }), false)
  assert.equal(isLinkableStaffIdentity({ ...good, userActive: false }), false)
  assert.equal(isLinkableStaffIdentity({ ...good, platformRole: "SUPER_ADMIN" }), false)
})

test("personal bookings are constrained to the authenticated staff profile and tenant in SQL", () => {
  const page = readFileSync("app/(admin)/admin/[slug]/barbeiro/page.tsx", "utf8")
  assert.match(page, /selection\.mode === "own"/)
  assert.match(page, /barbershopId: shopId, userId: selection\.userId/)
  assert.match(page, /id: selection\.professionalId, barbershopId: shopId/)
  assert.match(page, /barbershopId: shopId, staffMemberId: professional\.id/)
  assert.match(page, /localAgendaDate\(booking\.startsAt, timeZone\) === date/)
  assert.doesNotMatch(page, /customerPhoneSnapshot|customerEmailSnapshot|servicePriceSnapshot/)
  assert.match(page, /Pré-visualização para administração/)
  assert.match(page, /Ainda sem agenda individual disponível/)
})

test("assigning barber accounts is restricted to active STAFF users in one tenant", () => {
  const service = readFileSync("lib/staff-account-link.ts", "utf8")
  const action = readFileSync("app/(admin)/admin/[slug]/actions.ts", "utf8")
  assert.match(service, /where: \{ barbershopId_userId: \{ barbershopId, userId \} \}/)
  assert.match(service, /isLinkableStaffIdentity/)
  assert.match(service, /where: \{ barbershopId, userId, id: \{ not: staffMemberId \} \}/)
  assert.match(service, /where: \{ id_barbershopId: \{ id: staffMemberId, barbershopId \} \}/)
  assert.match(action, /requireBarbershopBySlug\(rawSlug, \["OWNER", "ADMIN"\]\)/)
  assert.match(action, /linkStaffAccount\(/)
  const panel = readFileSync("app/(admin)/admin/[slug]/professionals/page.tsx", "utf8")
  assert.match(panel, /staffAccounts/)
  assert.match(panel, /role: "STAFF"/)
  assert.match(panel, /Ver painel deste barbeiro/)
})

test("staff administrative URLs redirect before reading other customers or bookings", () => {
  for (const section of ["agenda", "chairs", "services", "hours", "club"]) {
    const source = readFileSync("app/(admin)/admin/[slug]/" + section + "/page.tsx", "utf8")
    assert.match(source, /if \(access\.membership\.role === "STAFF"\)/, section)
    assert.match(source, /redirect\("\/admin\/".*?\/barbeiro"\)/, section)
  }
  const professionals = readFileSync("app/(admin)/admin/[slug]/professionals/page.tsx", "utf8")
  assert.match(professionals, /if \(access\.membership\.role === "STAFF"\)/)
  assert.match(professionals, /redirect\("\/admin\/".*?\/barbeiro"\)/)
  const overview = readFileSync("app/(admin)/admin/[slug]/page.tsx", "utf8")
  assert.match(overview, /if \(access\.membership\.role === "STAFF"\)/)
  const staffNav = readFileSync("lib/admin-navigation.ts", "utf8")
  assert.match(staffNav, /staffOnly: true/)
  const customers = readFileSync("app/(admin)/admin/[slug]/customers/page.tsx", "utf8")
  assert.match(customers, /requireBarbershopBySlug\(slug, \["OWNER", "ADMIN"\]\)/)
})

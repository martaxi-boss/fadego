import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { tenantModulesForRole } from "../lib/admin-navigation"

const read = (path: string) => readFileSync(path, "utf8")

test("Super Admin shows working creation and account-management links", () => {
  const overview = read("app/(super-admin)/super-admin/page.tsx")
  const accounts = read("app/(super-admin)/super-admin/barbearias/page.tsx")
  const details = read("app/(super-admin)/super-admin/barbearias/[id]/page.tsx")
  const actions = read("app/(super-admin)/super-admin/actions.ts")

  assert.match(overview, /href="\/super-admin\/barbearias#nova-barbearia"/)
  assert.match(overview, /href="\/super-admin\/barbearias"/)
  assert.match(accounts, /id="nova-barbearia"/)
  assert.match(accounts, /action=\{createPlatformShopAction\}/)
  assert.match(actions, /await requireSuperAdmin\(\)/)
  assert.match(details, /await requireSuperAdmin\(\)/)
  assert.match(details, /href=\{"\/b\/" \+ shop\.slug\}/)
  assert.match(details, /shop\.status === "ACTIVE"/)
})

test("owner console distinguishes real slug routes from unavailable subdomains", () => {
  const overview = read("app/(super-admin)/super-admin/page.tsx")
  const accounts = read("app/(super-admin)/super-admin/barbearias/page.tsx")
  const details = read("app/(super-admin)/super-admin/barbearias/[id]/page.tsx")

  assert.match(overview, /\/b\/nome-da-barbearia/)
  assert.match(overview, /Subdomínios: pendentes/)
  assert.match(accounts, /fadego\.duckdns\.org\/b\/identificador/)
  assert.match(accounts, /dependem do domínio e da configuração DNS/)
  assert.match(details, /O subdomínio próprio ainda não está ligado ao DNS/)
  assert.match(overview, /shop\.gmailSenderConnection \? "Ligado" : "Por ligar"/)
  assert.match(accounts, /shop\.gmailSenderConnection \? "Ligado" : "Por ligar"/)
})

test("Gmail is self-connected by a tenant manager, never by the platform Owner", () => {
  const navOwner = tenantModulesForRole("OWNER")
  const navAdmin = tenantModulesForRole("ADMIN")
  const navStaff = tenantModulesForRole("STAFF")
  assert.equal(navOwner.find((m) => m.href === "contact")?.label, "Gmail")
  assert.equal(navAdmin.find((m) => m.href === "contact")?.label, "Gmail")
  assert.equal(navStaff.some((m) => m.href === "contact"), false)

  const tenantPage = read("app/(admin)/admin/[slug]/contact/page.tsx")
  const gmailActions = read("app/(admin)/admin/[slug]/gmail-actions.ts")
  const overview = read("app/(super-admin)/super-admin/page.tsx")
  assert.match(tenantPage, /Ligar o Gmail do negócio com a Google/)
  assert.match(gmailActions, /requireBarbershopBySlug\(slug, \["OWNER", "ADMIN"\]\)/)
  assert.match(overview, /Envios reais: desativados no piloto/)
  assert.doesNotMatch(overview, /connectGmailAction|activateGmailAction/)
})

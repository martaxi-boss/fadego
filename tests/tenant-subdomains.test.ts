import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import {
  RESERVED_TENANT_LABELS, tenantBaseDomain, tenantFromHostname,
  tenantHostRoute, tenantSubdomainUrl,
} from "../lib/tenant-subdomains"
import { createPlatformShopSchema } from "../lib/platform-account-policy"

const configured = {
  FADEGO_TENANT_BASE_DOMAIN: "fadego.pt",
  FADEGO_TENANT_SUBDOMAINS_READY: "true",
  NEXTAUTH_URL: "https://fadego.duckdns.org",
}

test("automatic tenant address needs proven DNS+TLS readiness (fail closed)", () => {
  assert.equal(tenantSubdomainUrl("barbearia-a", { ...configured, FADEGO_TENANT_SUBDOMAINS_READY: "false" }), null)
  assert.equal(tenantSubdomainUrl("barbearia-a", { ...configured, FADEGO_TENANT_SUBDOMAINS_READY: undefined }), null)
  assert.equal(tenantBaseDomain({ ...configured, FADEGO_TENANT_BASE_DOMAIN: "https://fadego.pt" }), null)
  assert.equal(tenantBaseDomain({ ...configured, FADEGO_TENANT_BASE_DOMAIN: "bad..domain" }), null)
  assert.equal(tenantBaseDomain({ ...configured, FADEGO_TENANT_BASE_DOMAIN: "fadego.pt", NEXTAUTH_URL: "http://fadego.duckdns.org" }), null)
  assert.equal(tenantBaseDomain(configured), "fadego.pt")
  assert.equal(tenantSubdomainUrl("barbearia-a", configured), "https://barbearia-a.fadego.pt")
  assert.equal(tenantSubdomainUrl("Barbearia-A", configured), null)
  assert.equal(tenantSubdomainUrl("barbearia.a", configured), null)
})

test("tenant hostname routing accepts only one active, validated tenant label", () => {
  assert.equal(tenantFromHostname("barbearia-a.fadego.pt", "fadego.pt", "fadego.duckdns.org"), "barbearia-a")
  assert.equal(tenantFromHostname("barbearia-a.fadego.pt:443", "fadego.pt", "fadego.duckdns.org"), "barbearia-a")
  for (const bad of [
    "fadego.pt", "fadego.pt.attacker.test", "x.y.fadego.pt", "www.fadego.pt",
    "admin.fadego.pt", "api.fadego.pt", "-bad.fadego.pt", "wrong.com",
  ]) assert.equal(tenantFromHostname(bad, "fadego.pt", "fadego.duckdns.org"), null, bad)
  assert.equal(tenantFromHostname("fadego.duckdns.org", "fadego.duckdns.org", "fadego.duckdns.org"), null)
  assert.equal(tenantFromHostname("barbearia-b.fadego.duckdns.org",
    "fadego.duckdns.org", "fadego.duckdns.org"), "barbearia-b")
})

test("portal, workers, customers and public booking have distinct scoped destinations", () => {
  const cases = [
    ["/", "rewrite", "/espaco/norte"],
    ["/marcar", "rewrite", "/b/norte"],
    ["/cliente", "rewrite", "/b/norte/recuperar"],
    ["/gestao", "platform-redirect", "/admin/norte"],
    ["/equipa", "platform-redirect", "/admin/norte/agenda"],
    ["/login", "platform-redirect", "/login?acesso=equipa"],
    ["/b/norte", "next", undefined],
    ["/b/norte/recuperar", "next", undefined],
    ["/admin/outra-barbearia", "not-found", undefined],
    ["/r/wrong-tenant", "not-found", undefined],
  ] as const
  for (const [path, kind, target] of cases) {
    const route = tenantHostRoute("norte", path)
    assert.equal(route.kind, kind, path)
    if ("path" in route) assert.equal(route.path, target)
  }
  const proxy = readFileSync("proxy.ts", "utf8")
  assert.match(proxy, /tenantFromHostname/)
  assert.match(proxy, /tenantHostRoute/)
  assert.match(proxy, /NextResponse\.rewrite/)
  assert.match(proxy, /new URL\(route\.path, canonical\.origin\)/)
  assert.match(proxy, /Method Not Allowed/)
  assert.doesNotMatch(proxy, /set-cookie|credentials:\s*["']include["']/i)
})

test("automatic provisioning does not allow reserved domain labels", () => {
  const input = {
    name: "Barbearia do Bairro", ownerEmail: "dono@gmail.com", contactEmail: "",
  }
  assert.ok(RESERVED_TENANT_LABELS.has("portal"))
  for (const slug of ["portal", "www", "admin", "api", "mail"]) {
    assert.equal(tenantSubdomainUrl(slug, configured), null)
    assert.equal(createPlatformShopSchema.safeParse({ ...input, slug }).success, false)
  }
  assert.equal(createPlatformShopSchema.safeParse({ ...input, slug: "barbearia-do-bairro" }).success, true)
})

test("tenant hub keeps business roles apart from the public client flow", () => {
  const hub = readFileSync("app/espaco/[slug]/page.tsx", "utf8")
  const panel = readFileSync("app/(admin)/admin/[slug]/page.tsx", "utf8")
  const gmail = readFileSync("app/(admin)/admin/[slug]/gmail-actions.ts", "utf8")
  assert.match(hub, /shop\.status !== "ACTIVE"/)
  assert.match(hub, /Marcar serviço/)
  assert.match(hub, /Recuperar reserva/)
  assert.match(hub, /Área da equipa/)
  assert.match(hub, /admin\/" \+ shop\.slug/)
  assert.match(hub, /admin\/" \+ shop\.slug \+ "\/agenda/)
  assert.match(panel, /isManager = access\.membership\.role !== "STAFF"/)
  assert.match(panel, /isManager \? \(/)
  assert.match(panel, /Ligar Gmail do negócio/)
  assert.match(panel, /tenantSubdomainUrl\(slug\)/)
  assert.match(gmail, /requireBarbershopBySlug\(slug, \["OWNER", "ADMIN"\]\)/)
  assert.doesNotMatch(hub, /connectGmailAction|activateGmailAction/)
})

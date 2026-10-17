import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

test("public booking catalog never selects OAuth identities or the tenant contact mailbox", () => {
  const source = readFileSync("lib/public-booking.ts", "utf8")
  const start = source.indexOf("export const getPublicCatalog")
  const end = source.indexOf("export const getPublicAvailability", start)
  assert.ok(start !== -1 && end > start)
  const publicCatalog = source.slice(start, end)
  assert.doesNotMatch(publicCatalog, /\bcontactEmail\b|\bgmailSenderConnection\b|\bsealedRefreshToken\b|\bgoogleSubject\b/)
  assert.doesNotMatch(publicCatalog, /\bGOOGLE_GMAIL_CLIENT_SECRET\b|\bGMAIL_TOKEN_ENCRYPTION_SECRET\b/)
  const publicPage = readFileSync("app/b/[slug]/page.tsx", "utf8")
  assert.doesNotMatch(publicPage, /\bprocess\.env\b|\bgmailSenderConnection\b|\bGOOGLE_GMAIL_CLIENT_SECRET\b/)
})

test("barbershop email and Gmail connection controls remain manager-only", () => {
  const page = readFileSync("app/(admin)/admin/[slug]/contact/page.tsx", "utf8")
  assert.match(page, /requireBarbershopBySlug\(slug, \["OWNER", "ADMIN", "STAFF"\]\)/)
  assert.match(page, /if \(access\.membership\.role === "STAFF"\) notFound\(\)/)
  assert.match(page, /Opção 1 — endereço de envio FADEGO/)
  assert.match(page, /Opção 2 — Gmail próprio da barbearia/)
})

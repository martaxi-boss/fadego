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
  assert.ok(page.includes("Gmail das reservas"))
  assert.ok(page.includes("Ligar o Gmail do negócio"))
  assert.ok(page.includes("Email para receber respostas (opcional)"))
  assert.ok(!page.includes("Opção 1 — endereço de envio FADEGO"))
  assert.ok(!page.includes("Opção 2 — Gmail próprio da barbearia"))
  assert.ok(!page.includes("platformSendingReady"))
  assert.ok(page.includes("gmail.sendingEnabledAt && liveGmailReady"))
  const action = readFileSync("app/(admin)/admin/[slug]/actions.ts", "utf8")
  assert.ok(action.includes('formData.has("senderAlias")'))
  assert.ok(action.includes('senderAlias && senderAlias.success'))
  assert.ok(action.includes(': { contactEmail: parsed.data }'))
})

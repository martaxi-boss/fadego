import assert from "node:assert/strict"
import { test } from "node:test"
import { barbershopContactEmailSchema, barbershopSenderAliasSchema } from "../lib/operational-validation"
import { bookingConfirmationMessage, resolveTenantSenderAddress } from "../lib/booking-email"
import { openBookingEmail, sealBookingEmail } from "../lib/booking-email-crypto"

const secret = "test-only-no-real-credential-" + "Q".repeat(40)
const booking = {
  email: "customer@example.test",
  customerName: "Cliente Exemplo",
  barbershopName: "Barbearia do Norte",
  barbershopSlug: "norte",
  senderAlias: "marca-norte",
  barbershopContactEmail: "shop-north@example.test",
  serviceName: "Corte",
  startsAt: "2030-01-07T09:00:00.000Z",
  timezone: "Europe/Lisbon",
  accessCode: "ABCDEFGH",
}

test("tenant contact accepts existing mailboxes and rejects forged headers", () => {
  assert.equal(barbershopContactEmailSchema.parse("  OWNER@GMAIL.COM "), "owner@gmail.com")
  assert.equal(barbershopContactEmailSchema.parse(""), null)
  for (const value of ["not-email", "user" + String.fromCharCode(13, 10) + "BCC:other@example.test", "user@@example.test"]) {
    assert.equal(barbershopContactEmailSchema.safeParse(value).success, false)
  }
})

test("two shops share the same verified sender domain but different reply addresses", () => {
  const sender = "reservas@verified.example"
  const origin = "https://fadego.duckdns.org"
  const north = bookingConfirmationMessage(booking, origin, sender)
  const south = bookingConfirmationMessage({
    ...booking, barbershopName: "Barbearia do Sul",
    barbershopSlug: "sul", senderAlias: "barbearia-sul",
    barbershopContactEmail: "shop-south@example.test",
  }, origin, sender)
  assert.equal(north.from, "Barbearia do Norte <marca-norte+norte@verified.example>")
  assert.equal(south.from, "Barbearia do Sul <barbearia-sul+sul@verified.example>")
  assert.equal(north.replyTo, "shop-north@example.test")
  assert.equal(south.replyTo, "shop-south@example.test")
  assert.equal(north.to, booking.email)
  assert.equal(south.to, booking.email)
  assert.match(north.text, /Barbearia do Norte/)
  assert.ok(north.text.includes("/r/ABCDEFGH"))
})

test("tenant reply address stays encrypted in queued message", () => {
  const sealed = sealBookingEmail(booking, secret)
  assert.ok(!sealed.includes(booking.barbershopContactEmail))
  assert.deepEqual(openBookingEmail(sealed, secret), booking)
})

test("missing tenant mailbox and malicious display name never spoof From", () => {
  const msg = bookingConfirmationMessage({
    ...booking, barbershopContactEmail: undefined,
    barbershopName: "Example" + String.fromCharCode(13, 10) + "BCC:bad@example.test <forged@malicious.test>",
  }, "https://fadego.duckdns.org", "reservas@verified.example")
  assert.equal(msg.replyTo, undefined)
  assert.ok(msg.from.endsWith("<marca-norte+norte@verified.example>"))
  assert.equal(msg.from.includes(String.fromCharCode(10)), false)
  assert.equal(msg.from.includes(String.fromCharCode(13)), false)
  assert.equal(msg.from.includes("<forged@"), false)
})

test("shops can choose a safe email prefix; long slugs still fit SMTP limit", () => {
  assert.equal(barbershopSenderAliasSchema.parse(" Cortes-1 "), "cortes-1")
  assert.equal(barbershopSenderAliasSchema.parse(""), null)
  for (const value of ["someone@gmail.com", "a+b", "../x", "a".repeat(33), "a_b"]) {
    assert.equal(barbershopSenderAliasSchema.safeParse(value).success, false)
  }
  assert.equal(resolveTenantSenderAddress(
    { ...booking, senderAlias: undefined }, "reservas@verified.example",
  ), "reservas+norte@verified.example")
  const longSlug = "barbearia-" + "m".repeat(53)
  const address = resolveTenantSenderAddress({
    ...booking, barbershopSlug: longSlug, senderAlias: "escolhido-com-30-caracteres-123",
  }, "reservas@verified.example")
  assert.ok(address.includes("@verified.example"))
  assert.ok(address.split("@")[0].length <= 64)
  assert.notEqual(address, resolveTenantSenderAddress({
    ...booking, barbershopSlug: longSlug.slice(0, -1) + "n",
    senderAlias: "escolhido-com-30-caracteres-123",
  }, "reservas@verified.example"))
  assert.throws(() => resolveTenantSenderAddress(booking, "forged\\nBcc:evil@other.example"))
  assert.throws(() => resolveTenantSenderAddress({
    ...booking, senderAlias: "victim@outside.example",
  }, "reservas@verified.example"), /INVALID_TENANT_SENDER/)
})

test("legacy encrypted booking notifications retain original From address", () => {
  const legacy = { ...booking, barbershopSlug: undefined, senderAlias: undefined }
  assert.equal(bookingConfirmationMessage(
    legacy, "https://fadego.duckdns.org", "reservas@verified.example",
  ).from, "Barbearia do Norte <reservas@verified.example>")
})

import assert from "node:assert/strict"
import { test } from "node:test"
import { barbershopContactEmailSchema } from "../lib/operational-validation"
import { bookingConfirmationMessage } from "../lib/booking-email"
import { openBookingEmail, sealBookingEmail } from "../lib/booking-email-crypto"

const secret = "test-only-no-real-credential-" + "Q".repeat(40)
const booking = {
  email: "customer@example.test",
  customerName: "Cliente Exemplo",
  barbershopName: "Barbearia do Norte",
  barbershopContactEmail: "shop-north@example.test",
  serviceName: "Corte",
  startsAt: "2030-01-07T09:00:00.000Z",
  timezone: "Europe/Lisbon",
  accessCode: "ABCDEFGH",
}

test("tenant contact accepts existing mailboxes and rejects forged headers", () => {
  assert.equal(barbershopContactEmailSchema.parse("  OWNER@GMAIL.COM "), "owner@gmail.com")
  assert.equal(barbershopContactEmailSchema.parse(""), null)
  for (const value of ["not-email", "user\\r\\nBCC:other@example.test", "user@@example.test"]) {
    assert.equal(barbershopContactEmailSchema.safeParse(value).success, false)
  }
})

test("two shops share the same verified sender domain but different reply addresses", () => {
  const sender = "reservas@verified.example"
  const origin = "https://fadego.duckdns.org"
  const north = bookingConfirmationMessage(booking, origin, sender)
  const south = bookingConfirmationMessage({
    ...booking, barbershopName: "Barbearia do Sul",
    barbershopContactEmail: "shop-south@example.test",
  }, origin, sender)
  assert.equal(north.from, "Barbearia do Norte <" + sender + ">")
  assert.equal(south.from, "Barbearia do Sul <" + sender + ">")
  assert.equal(north.replyTo, "shop-north@example.test")
  assert.equal(south.replyTo, "shop-south@example.test")
  assert.equal(north.to, booking.email)
  assert.equal(south.to, booking.email)
  assert.match(north.text, /Barbearia do Norte/)
  assert.match(north.text, /\\/r\\/ABCDEFGH/)
})

test("tenant reply address stays encrypted in queued message", () => {
  const sealed = sealBookingEmail(booking, secret)
  assert.ok(!sealed.includes(booking.barbershopContactEmail))
  assert.deepEqual(openBookingEmail(sealed, secret), booking)
})

test("missing tenant mailbox and malicious display name never spoof From", () => {
  const msg = bookingConfirmationMessage({
    ...booking, barbershopContactEmail: undefined,
    barbershopName: "Example\\r\\nBCC:bad@example.test <forged@malicious.test>",
  }, "https://fadego.duckdns.org", "reservas@verified.example")
  assert.equal(msg.replyTo, undefined)
  assert.ok(msg.from.endsWith("<reservas@verified.example>"))
  assert.doesNotMatch(msg.from, /\\r|\\n|<forged@/)
})

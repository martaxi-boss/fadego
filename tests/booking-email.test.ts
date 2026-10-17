import assert from "node:assert/strict"
import { test } from "node:test"
import {
  openBookingEmail,
  sealBookingEmail,
  type BookingEmailPayload,
} from "@/lib/booking-email-crypto"
import {
  bookingConfirmationMessage,
  bookingEmailProviderReady,
} from "@/lib/booking-email"

const secret = "test-only-no-real-credential-" + "Q".repeat(40)
const payload: BookingEmailPayload = {
  email: "cliente@example.test",
  customerName: "João de Teste",
  barbershopName: "Atelier Barbeiro",
  serviceName: "Corte + barba",
  startsAt: "2030-01-07T09:00:00.000Z",
  timezone: "Europe/Lisbon",
  accessCode: "ABCDEFGH",
}

test("the private link and email are encrypted and authenticated at rest", () => {
  const first = sealBookingEmail(payload, secret)
  const second = sealBookingEmail(payload, secret)
  assert.match(first, /^v1:/)
  assert.notEqual(first, second, "AES-GCM must use a fresh random IV")
  assert.ok(!first.includes(payload.accessCode))
  assert.ok(!first.includes(payload.email))
  assert.deepEqual(openBookingEmail(first, secret), payload)
  assert.throws(() => openBookingEmail(first, secret + "WRONG"))
  assert.throws(() => openBookingEmail(first.slice(0, -3) + "xxx", secret))
  assert.throws(() => sealBookingEmail(payload, "too-short"))
})

test("email confirmation contains a usable private booking link and no HTML injection", () => {
  const message = bookingConfirmationMessage(
    { ...payload, barbershopName: "Atelier\nBCC:fake@example.com" },
    "https://fadego.duckdns.org",
    "reservas@example.test",
  )
  assert.equal(message.to, payload.email)
  assert.match(message.subject, /FADEGO/)
  assert.match(message.text, /https:\/\/fadego\.duckdns\.org\/r\/ABCDEFGH/)
  assert.match(message.text, /altera o horário ou cancela/)
  assert.match(message.text, /Corte \+ barba/)
  assert.doesNotMatch(message.text, /Atelier\nBCC:/)
  assert.equal("html" in message, false)
})

test("booking email provider fails closed before activation and rejects HTTP or malformed sender", () => {
  const configured = {
    BOOKING_EMAIL_PROVIDER: "resend",
    BOOKING_EMAIL_FROM: "reservas@example.test",
    BOOKING_EMAIL_API_KEY: "re_test_only_not_real",
    NEXTAUTH_SECRET: secret,
    NEXTAUTH_URL: "https://fadego.duckdns.org",
  }
  assert.equal(bookingEmailProviderReady({}), false)
  assert.equal(bookingEmailProviderReady(configured), true)
  assert.equal(bookingEmailProviderReady({ ...configured, NEXTAUTH_URL: "http://fadego.duckdns.org" }), false)
  assert.equal(bookingEmailProviderReady({ ...configured, NEXTAUTH_URL: "https://fadego.duckdns.org/a" }), false)
  assert.equal(bookingEmailProviderReady({ ...configured, BOOKING_EMAIL_FROM: "forged\nBcc:bad@example.test" }), false)
  assert.equal(bookingEmailProviderReady({ ...configured, BOOKING_EMAIL_API_KEY: "" }), false)
  assert.equal(bookingEmailProviderReady({ ...configured, BOOKING_EMAIL_PROVIDER: "disabled" }), false)
})


test("reschedule and cancellation notices state the correct time and retain the same private link", () => {
  const moved = bookingConfirmationMessage(
    { ...payload, kind: "RESCHEDULED", previousStartsAt: "2030-01-07T08:00:00.000Z" },
    "https://fadego.duckdns.org",
    "reservas@example.test",
  )
  assert.match(moved.subject, /alterada/)
  assert.match(moved.text, /Horário anterior:/)
  assert.match(moved.text, /Novo horário:/)
  assert.match(moved.text, /https:\/\/fadego\.duckdns\.org\/r\/ABCDEFGH/)

  const cancelled = bookingConfirmationMessage(
    { ...payload, kind: "CANCELLED" },
    "https://fadego.duckdns.org",
    "reservas@example.test",
  )
  assert.match(cancelled.subject, /cancelada/)
  assert.match(cancelled.text, /A tua marcação foi cancelada/)
  assert.doesNotMatch(cancelled.text, /altera o horário ou cancela/)
  assert.match(cancelled.text, /\/r\/ABCDEFGH/)
})

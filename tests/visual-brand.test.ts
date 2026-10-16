import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const home = readFileSync("app/page.tsx", "utf8")
const login = readFileSync("app/login/page.tsx", "utf8")
const publicBooking = readFileSync("app/b/[slug]/page.tsx", "utf8")
const capture = readFileSync("scripts/ci-capture-ux.cjs", "utf8")
const shell = readFileSync("app/_components/admin-shell.tsx", "utf8")
const illustration = readFileSync("public/fadego-atelier.svg", "utf8")
const mark = readFileSync("public/fadego-mark.svg", "utf8")

test("FADEGO identity uses original locally hosted artwork without third-party image calls", () => {
  for (const page of [home, login, shell]) {
    assert.match(page, /\/fadego-mark\.svg/)
    assert.doesNotMatch(page, /https?:\/\/(?:images|source)\.unsplash\.com/)
  }
  assert.match(home, /\/fadego-atelier\.svg/)
  assert.match(login, /\/fadego-atelier\.svg/)
  assert.match(illustration, /^<svg/)
  assert.match(mark, /^<svg/)
})

test("public page keeps navigation and clearly marks demo reservations", () => {
  assert.match(home, /href="\/login"/)
  assert.match(home, /id="funcionalidades"/)
  assert.match(home, /Sem marcações reais/)
  assert.match(home, /Pagamentos online ainda não estão disponíveis/)
  assert.match(home, /Dados separados por barbearia/)
  assert.doesNotMatch(home, /href="#"/)
})

test("login form and accessible image description remain functional", () => {
  assert.match(login, /<LoginForm \/>/)
  assert.match(login, /Entrar na plataforma/)
  assert.match(login, /href="\/"/)
  assert.match(home, /alt="Ilustração de uma barbearia/)
  assert.match(home, /h-\[410px\]/)
  assert.match(home, /sm:h-\[560px\]/)
})

test("the customer booking screen shows each barbershop's own identity and retains the original flow", () => {
  assert.match(publicBooking, /catalog\.name/)
  assert.match(publicBooking, /catalog\.logoUrl/)
  assert.match(publicBooking, /<PublicBookingFlow/)
  assert.match(publicBooking, /generalAvailable=\{catalog\.generalAvailable\}/)
  assert.match(publicBooking, /Reserva sem criar conta/)
})

test("the CI browser presentation captures desktop and mobile login", () => {
  assert.match(capture, /13-login-desktop\.jpg/)
  assert.match(capture, /14-login-mobile\.jpg/)
})

test("booking form requires valid email and describes private actions", () => {
  const flow = readFileSync("app/b/[slug]/public-booking-flow.tsx", "utf8")
  assert.match(flow, /Email <span className="font-semibold/)
  assert.match(flow, /type="email"/)
  assert.match(flow, /aria-describedby="booking-email-explanation"/)
  assert.match(flow, /para consultar, remarcar ou cancelar/)
  assert.match(flow, /EMAIL_UNAVAILABLE/)
})

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const home = readFileSync("app/page.tsx", "utf8")
const login = readFileSync("app/login/page.tsx", "utf8")
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

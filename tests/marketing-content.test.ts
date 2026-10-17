import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const home = readFileSync("app/page.tsx", "utf8")

test("FADEGO landing explains real booking mechanics in three sequential steps", () => {
  assert.match(home, /id="como-funciona"/)
  assert.match(home, /A barbearia prepara/)
  assert.match(home, /O cliente escolhe/)
  assert.match(home, /A marcação fica na agenda/)
  assert.match(home, /serviços, preços, profissionais, cadeiras e horários/)
  assert.match(home, /o dia e a hora/)
  assert.match(home, /link privado para alterar ou cancelar/)
})

test("FADEGO commercial page explains the two audiences without implying shared tenant data", () => {
  assert.match(home, /Para o dono da barbearia/)
  assert.match(home, /Para quem vai cortar o cabelo/)
  assert.match(home, /Cada uma tem o seu painel, a sua equipa e os seus clientes/)
  assert.match(home, /A administração da plataforma fica separada/)
  assert.match(home, /Até cinco cadeiras/i)
})

test("public CTAs open the actual isolated browser-local demonstration, not a fictional signup", () => {
  assert.match(home, /href="\/experimentar"/)
  assert.match(home, /Experimentar sem login/)
  assert.match(home, /Ver demonstração/)
  assert.match(home, /href="\/login"/)
  assert.match(home, /Dados fictícios|dados fictícios/)
  assert.doesNotMatch(home, /href="\/registar"/)
  assert.doesNotMatch(home, /href="#"/)
})

test("Gmail and commercial scope are disclosed honestly during the pilot", () => {
  assert.match(home, /Gmail do negócio autorizado/)
  assert.match(home, /quando o Gmail do próprio negócio estiver ligado e autorizado/)
  assert.match(home, /fase piloto/)
  assert.match(home, /Pagamentos online ainda não estão disponíveis/)
  assert.doesNotMatch(home, /pagamentos (integrados|automáticos|disponíveis)/i)
  assert.doesNotMatch(home, /emails automáticos já ativos/i)
})

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const home = readFileSync("app/page.tsx", "utf8")

test("institutional homepage is informational, separate from private operational portal", () => {
  assert.match(home, /Website FADEGO/)
  assert.match(home, /Portal da plataforma/)
  assert.match(home, /Painel de cada barbearia/)
  assert.match(home, /Página de reservas/)
  assert.match(home, /website explica a plataforma/)
  assert.match(home, /href="\/login"/)
  assert.match(home, /Portal FADEGO/)
  assert.doesNotMatch(home, /href="\/experimentar"/)
  assert.doesNotMatch(home, /href="\/b\//)
  assert.doesNotMatch(home, /<form\b/)
})

test("homepage explains configuration, customer booking and notification journey", () => {
  assert.match(home, /A barbearia organiza/)
  assert.match(home, /O cliente marca/)
  assert.match(home, /Todos acompanham/)
  assert.match(home, /[Nn]ão precisa de criar uma conta FADEGO/)
  assert.match(home, /link privado para consultar, alterar ou cancelar/)
  assert.match(home, /Gmail do negócio ligado/)
})

test("website informs how barbershop schedules, chairs, staff and Club work", () => {
  assert.match(home, /Agenda e reservas/)
  assert.match(home, /Serviços e horários/)
  assert.match(home, /Equipa e cadeiras/)
  assert.match(home, /Clientes e Club/)
  assert.match(home, /até cinco cadeiras/)
  assert.match(home, /Dados separados por barbearia/)
})

test("future portal management and unavailable services never appear as live offers", () => {
  assert.match(home, /faz parte da próxima fase do portal/)
  assert.match(home, /Próximas funcionalidades/)
  assert.match(home, /Pagamentos online ainda não estão disponíveis/)
  assert.match(home, /fase de testes/)
  assert.doesNotMatch(home, /Entrar na plataforma/)
  assert.doesNotMatch(home, /Ver demonstração/)
  assert.doesNotMatch(home, /Experimentar sem login/)
})

test("marketing page uses local static assets, not external tracking, forms or network calls", () => {
  assert.match(home, /\/fadego-mark\.webp/)
  assert.match(home, /\/fadego-atelier\.svg/)
  assert.match(home, /unoptimized/)
  assert.doesNotMatch(home, /<script\b/)
  assert.doesNotMatch(home, /https?:\/\/(?:images|source)\.unsplash\.com/)
  assert.doesNotMatch(home, /fetch\(/)
})

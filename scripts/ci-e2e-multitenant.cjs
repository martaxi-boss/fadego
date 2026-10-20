/* CI-only browser validation of two separate tenants and restricted staff access. */
const assert = require("node:assert/strict")
const { chromium } = require("/tmp/fadego-playwright/node_modules/playwright")
const { Client } = require("pg")

const base = "http://localhost:3000"
const shopA = "atelier-fadego-demo"
const shopB = "barbearia-norte-demo"
const privateCustomer = "Cliente Norte Fictício"
const privatePhone = "+351 919 999 991"

// Real disposable CI PostgreSQL assertion: hiding a future-domain sender field
// must not silently clear its previously configured value.
async function readSenderAlias(slug) {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
    const { rows } = await client.query(
      'SELECT "senderAlias" FROM "Barbershop" WHERE "slug" = $1',
      [slug],
    )
    assert.equal(rows.length, 1, "Expected one synthetic tenant")
    return rows[0].senderAlias
  } finally {
    await client.end()
  }
}

async function open(page, path) {
  const response = await page.goto(base + path, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  })
  assert.ok(response, "Navigation produced no HTTP response: " + path)
  return response
}

async function signIn(page, email) {
  const owner = email === process.env.FADEGO_DEMO_EMAIL
  await open(page, owner ? "/login" : "/login?acesso=equipa")
  if (owner) {
    assert.equal(await page.locator('input[name="email"]').count(), 0,
      "Owner must authenticate without a username")
    assert.equal(await page.locator('input[name="password"]').getAttribute("autocomplete"),
      "current-password", "Owner password should support Android autofill")
  } else {
    await page.locator('input[name="email"]').fill(email)
  }
  await page.locator('input[name="password"]').fill(process.env.FADEGO_DEMO_PASSWORD)
  await page.getByRole("button", {
    name: owner ? "Entrar no meu portal" : "Entrar", exact: true,
  }).click()
  await page.waitForURL((url) => url.pathname === (owner ? "/super-admin" : "/admin"),
    { timeout: 25000 })
}

function route(page) {
  return new URL(page.url()).pathname
}

async function assertNoPrivateCustomer(page, where) {
  const body = await page.locator("body").innerText()
  assert.ok(!body.includes(privateCustomer), where + ": unexpected customer")
  assert.ok(!body.includes(privatePhone), where + ": unexpected phone")
}

// Minimal structural accessibility contract (not a WCAG certification).
// Run in the actual browser: unlabelled interactive controls and images
// must not escape the production build.
async function assertCoreAccessibility(page, where) {
  const report = await page.evaluate(() => {
    const main = document.querySelector("main")
    if (!main) return { lang: document.documentElement.lang, main: false, controls: [], images: [] }
    const visible = (el) => el.getClientRects().length > 0
    const controls = [...main.querySelectorAll("button, input, select, textarea")]
      .filter((el) => visible(el) && el.getAttribute("type") !== "hidden")
      .filter((el) => {
        if (el.getAttribute("aria-label")?.trim()) return false
        if (el.getAttribute("aria-labelledby")?.trim()) return false
        if (el.labels?.length) return false
        if (el.tagName === "BUTTON" && el.textContent?.trim()) return false
        if (el.tagName === "INPUT" &&
          ["submit", "button", "reset"].includes(el.type) && el.value) return false
        return true
      })
      .map((el) => el.tagName.toLowerCase() + (el.getAttribute("name") ? "[name=" +
        el.getAttribute("name") + "]" : ""))
    const images = [...main.querySelectorAll("img")]
      .filter((el) => visible(el) && !el.hasAttribute("alt"))
      .map((el) => el.getAttribute("src")?.slice(0, 90) ?? "unknown")
    return { lang: document.documentElement.lang, main: true, controls, images }
  })
  assert.equal(report.lang, "pt-PT", where + ": document language must be Portuguese")
  assert.equal(report.main, true, where + ": main landmark is required")
  assert.deepEqual(report.controls, [], where + ": visible controls require accessible names")
  assert.deepEqual(report.images, [], where + ": images require alt text (may be empty for decoration)")
}

async function main() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  })
  try {
    const anonymousContext = await browser.newContext()
    const anonymous = await anonymousContext.newPage()
    let response = await open(anonymous, "/b/" + shopA)
    assert.equal(response.status(), 200)
    assert.match(await anonymous.locator("main").innerText(), /Corte masculino/)
    await assertCoreAccessibility(anonymous, "public shop A")
    const bookingEmailInput = anonymous.locator('input[name="email"]')
    assert.equal(await bookingEmailInput.getAttribute("required"), "", "Booking email is mandatory")

    response = await open(anonymous, "/b/" + shopB)
    assert.equal(response.status(), 200)
    assert.match(await anonymous.locator("main").innerText(), /Corte Norte/)
    await assertNoPrivateCustomer(anonymous, "Anonymous public booking page")
    await assertCoreAccessibility(anonymous, "public shop B")

    response = await open(anonymous, "/b/" + shopA + "/recuperar")
    assert.equal(response.status(), 200)
    await assertCoreAccessibility(anonymous, "customer recovery")

    await open(anonymous, "/admin/" + shopB)
    assert.ok(["/admin", "/login"].includes(route(anonymous)), "Anonymous tenant dashboard must redirect")
    await anonymousContext.close()

    const ownerContext = await browser.newContext()
    const owner = await ownerContext.newPage()
    await open(owner, "/login")
    await assertCoreAccessibility(owner, "administrative login")
    assert.equal(await owner.locator('input[name="email"]').count(), 0,
      "Platform portal must show only the password field")
    await owner.locator('input[name="password"]').fill("incorrect-owner-passphrase")
    await owner.getByRole("button", { name: "Entrar no meu portal" }).click()
    await owner.getByRole("alert").waitFor({ timeout: 20000 })
    assert.equal(route(owner), "/login", "Wrong owner password must never log in")
    await signIn(owner, process.env.FADEGO_DEMO_EMAIL)
    // Platform manager uses the actual disposable CI database.
    await open(owner, "/super-admin/barbearias")
    await assertCoreAccessibility(owner, "SUPER_ADMIN tenant accounts")
    await owner.locator('input[name="name"]').fill("Barbearia Gestão Fictícia")
    await owner.locator('input[name="slug"]').fill("barbearia-gestao-ci")
    await owner.locator('input[name="ownerEmail"]').fill("pending-owner-ci@example.test")
    await owner.locator('input[name="contactEmail"]').fill("ci-shop@example.test")
    await owner.getByRole("button", { name: "Criar barbearia suspensa" }).click()
    await owner.waitForURL((url) => url.pathname.startsWith("/super-admin/barbearias/") &&
      url.searchParams.get("notice") === "created", { timeout: 20000 })
    await assertCoreAccessibility(owner, "SUPER_ADMIN tenant detail")
    assert.match(await owner.locator("main").innerText(), /Identidade pendente/)
    const newShopId = route(owner).split("/").at(-1)
    const platformDb = new Client({ connectionString: process.env.DATABASE_URL })
    try {
      await platformDb.connect()
      const { rows } = await platformDb.query(
        'SELECT b."status", u."active" AS "userActive", m."active" AS "memberActive", m."role" FROM "Barbershop" b JOIN "BarbershopMember" m ON m."barbershopId" = b."id" JOIN "User" u ON u."id" = m."userId" WHERE b."id" = $1',
        [newShopId],
      )
      assert.equal(rows.length, 1)
      assert.deepEqual(rows[0], {
        status: "SUSPENDED", userActive: false, memberActive: false, role: "OWNER",
      }, "New tenant owner must never be granted active access automatically")
    } finally {
      await platformDb.end()
    }
    await owner.getByRole("button", { name: "Ativar barbearia" }).click()
    await owner.waitForURL((url) => url.searchParams.get("notice") === "not-ready", { timeout: 20000 })
    assert.match(await owner.locator("main").innerText(), /Antes de ativar/)
    // A real browser accepts a private owner invitation on disposable CI data.
    await owner.getByRole("button", { name: "Convidar proprietário", exact: true }).click()
    const inviteField = owner.getByRole("textbox", { name: "Convite privado do proprietário" })
    await inviteField.waitFor()
    const firstInvite = await inviteField.inputValue()
    await owner.getByRole("button", { name: "Revogar convite pendente", exact: true }).click()
    await owner.getByRole("button", { name: "Revogar convite pendente", exact: true }).waitFor({ state: "detached" })
    const invitedContext = await browser.newContext()
    const invited = await invitedContext.newPage()
    await open(invited, new URL(firstInvite).pathname)
    assert.match(await invited.locator("main").innerText(), /Convite inválido ou expirado/)
    await owner.getByRole("button", { name: "Convidar proprietário", exact: true }).click()
    await inviteField.waitFor()
    await owner.waitForFunction((previous) => {
      const field = document.querySelector('textarea[aria-label="Convite privado do proprietário"]')
      return field && field.value && field.value !== previous
    }, firstInvite)
    const ownerInvitation = await inviteField.inputValue()
    await open(invited, new URL(ownerInvitation).pathname)
    await assertCoreAccessibility(invited, "New business owner activation")
    await invited.locator('input[name="password"]').fill(process.env.FADEGO_DEMO_PASSWORD)
    await invited.locator('input[name="repeat"]').fill(process.env.FADEGO_DEMO_PASSWORD)
    await invited.getByRole("button", { name: "Ativar o meu acesso ao negócio", exact: true }).click()
    await invited.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("convite") === "aceite")
    const invitedDb = new Client({ connectionString: process.env.DATABASE_URL })
    try {
      await invitedDb.connect()
      const { rows } = await invitedDb.query(
        'SELECT b."status", u."active" AS "userActive", u."onboardingPending", u."platformRole", m."active" AS "memberActive", m."role" FROM "Barbershop" b JOIN "BarbershopMember" m ON m."barbershopId" = b."id" JOIN "User" u ON u."id" = m."userId" WHERE b."id" = $1', [newShopId])
      assert.deepEqual(rows[0], { status: "SUSPENDED", userActive: true, onboardingPending: false,
        platformRole: "USER", memberActive: true, role: "OWNER" }, "Invitation activates only this owner's access")
    } finally { await invitedDb.end() }
    await open(invited, new URL(ownerInvitation).pathname)
    assert.match(await invited.locator("main").innerText(), /Convite inválido ou expirado/, "Owner invitation cannot be replayed")
    await signIn(invited, "pending-owner-ci@example.test")
    await open(invited, "/super-admin")
    assert.equal(route(invited), "/admin", "New owner cannot become platform admin")
    await open(invited, "/admin/" + shopA)
    assert.equal(route(invited), "/admin", "New owner cannot open another tenant")
    await invitedContext.close()
    await open(owner, "/admin/" + shopA + "/contact")
    await assertCoreAccessibility(owner, "OWNER contact settings")
    const shopEmail = owner.locator('input[name="contactEmail"]')
    assert.equal(await shopEmail.inputValue(), "shop-a@example.test")
    assert.match(await owner.locator("main").innerText(), /Gmail das reservas/)
    assert.equal(await owner.locator('input[name="senderAlias"]').count(), 0,
      "Future-domain sender aliases must not appear in Gmail-only pilot")
    assert.equal(await readSenderAlias(shopA), "cortes",
      "Synthetic shop must have a stored sender alias before the update")
    assert.equal(await owner.getByText("Ligação Google ainda indisponível", { exact: false }).count(), 1,
      "Gmail link remains closed until Google OAuth credentials are configured")
    assert.equal(await owner.getByRole("button", { name: "Ligar o Gmail do negócio com a Google" }).count(), 0,
      "No active Gmail OAuth action before explicit platform setup")
    await shopEmail.fill("owner-test-inbox@example.test")
    await owner.getByRole("button", { name: "Guardar email para respostas" }).click()
    await owner.waitForURL((url) => url.searchParams.get("notice") === "saved", { timeout: 20000 })
    assert.equal(await owner.locator('input[name="contactEmail"]').inputValue(),
      "owner-test-inbox@example.test", "OWNER must save tenant-specific reply mailbox")
    assert.equal(await readSenderAlias(shopA), "cortes",
      "Editing the contact must preserve the future-domain sender alias")
    await open(owner, "/admin/" + shopA + "/customers")
    const ownerCustomers = await owner.locator("main").innerText()
    assert.match(ownerCustomers, /João de Exemplo/)
    assert.ok(!ownerCustomers.includes(privateCustomer), "Cross-tenant customer leaked to OWNER")
    // Owner-facing barbershop rehearsal, performed only on disposable CI data.
    await open(owner, "/admin/" + shopA + "/agenda?date=2030-05-20&status=NEEDS_REASSIGNMENT")
    await assertCoreAccessibility(owner, "OWNER agenda")
    const filteredAgenda = await owner.locator("main").innerText()
    assert.match(filteredAgenda, /André Demonstração/, "Owner must find reassignments")
    assert.ok(!filteredAgenda.includes("João de Exemplo"), "Status filter must hide other bookings")
    await owner.locator("article").filter({ hasText: "André Demonstração" })
      .getByRole("button", { name: "Reatribuir" }).click()
    await owner.waitForURL((url) => url.searchParams.get("notice") === "reassigned", { timeout: 20000 })
    await owner.getByRole("status").filter({ hasText: "Marcação reatribuída." }).waitFor()
    const reassigned = await owner.locator("article").filter({ hasText: "André Demonstração" }).innerText()
    assert.match(reassigned, /Confirmada/, "Owner reassign must confirm the booking")
    assert.match(reassigned, /Atendimento geral/, "Owner reassign must use the free general chair")

    await open(owner, "/admin/" + shopA + "/agenda?date=2030-05-20")
    await owner.getByRole("link", { name: "Semana", exact: true }).click()
    await owner.getByRole("region", { name: "Calendário semanal", exact: true }).waitFor()
    await assertCoreAccessibility(owner, "OWNER weekly calendar")
    assert.match(await owner.locator("main").innerText(), /2030-05-20 a 2030-05-26/)
    assert.ok(!(await owner.locator("main").innerText()).includes(privateCustomer),
      "Weekly calendar must keep tenant isolation")
    const calendarBooking = owner.locator('section[aria-label="Calendário semanal"] a[href^="#booking-"]').first()
    const detailsTarget = await calendarBooking.getAttribute("href")
    await calendarBooking.click()
    assert.equal(await owner.locator(detailsTarget).count(), 1,
      "Calendar appointment must link to its real details and actions")
    await owner.getByRole("link", { name: "Dia", exact: true }).click()
    await owner.getByRole("region", { name: "Calendário diário", exact: true }).waitFor()
    await owner.getByRole("button", { name: "Cancelar marcação de João de Exemplo" }).click()
    await owner.waitForURL((url) => url.searchParams.get("notice") === "cancelled", { timeout: 20000 })
    await owner.getByRole("status").filter({ hasText: "Marcação cancelada." }).waitFor()
    const cancelled = await owner.locator("article").filter({ hasText: "João de Exemplo" }).innerText()
    assert.match(cancelled, /Cancelada pela barbearia/, "Owner cancellation must be persisted")

    await open(owner, "/admin/" + shopA + "/agenda?date=2025-05-20")
    const completedFixture = owner.locator("article").filter({ hasText: "Rui Demonstrativo" })
    await completedFixture.getByRole("button", { name: "Concluir" }).click()
    await owner.waitForURL((url) => url.searchParams.get("notice") === "finished", { timeout: 20000 })
    await owner.getByRole("status").filter({ hasText: "Marcação concluída." }).waitFor()
    assert.match(
      await owner.locator("article").filter({ hasText: "Rui Demonstrativo" }).innerText(),
      /Concluída/,
      "Owner completion must persist",
    )
    await owner.locator("article").filter({ hasText: "Carlos de Teste" })
      .getByRole("button", { name: "Não compareceu" }).click()
    await owner.waitForURL((url) => url.searchParams.get("notice") === "no-show", { timeout: 20000 })
    await owner.getByRole("status").filter({ hasText: "Falta registada." }).waitFor()
    assert.match(
      await owner.locator("article").filter({ hasText: "Carlos de Teste" }).innerText(),
      /Falta/,
      "Owner no-show must persist",
    )
    assert.equal(await owner.locator("article").filter({ hasText: "Carlos de Teste" })
      .getByRole("button", { name: "Não compareceu" }).count(), 0,
    "Finalized booking must not show a second no-show action")

    await open(owner, "/admin/" + shopB)
    assert.equal(route(owner), "/admin", "Owner of tenant A must not open tenant B")
    await assertNoPrivateCustomer(owner, "Owner on unauthorized tenant")
    await ownerContext.close()

    const staffContext = await browser.newContext()
    const staff = await staffContext.newPage()
    await signIn(staff, "ci-staff-north@fadego.example")
    await open(staff, "/login?acesso=equipa")
    assert.equal(route(staff), "/admin", "Authenticated tenant staff stays in own admin")
    await open(staff, "/super-admin/barbearias")
    assert.equal(route(staff), "/admin", "STAFF must not manage platform accounts")
    assert.ok(!(await staff.locator("body").innerText()).includes("Barbearia Gestão Fictícia"))
    await open(staff, "/admin")
    const staffShops = await staff.locator("main").innerText()
    assert.match(staffShops, /Barbearia Norte/)
    assert.ok(!staffShops.includes("Atelier FADEGO"), "STAFF must not list tenant A")

    await open(staff, "/admin/" + shopB + "/barbeiro?date=2030-05-20")
    await assertCoreAccessibility(staff, "STAFF individual panel")
    const personalAgenda = await staff.locator("main").innerText()
    assert.match(personalAgenda, /Cliente do Barbeiro CI/,
      "STAFF must see the booking assigned to the authenticated professional")
    assert.ok(!personalAgenda.includes(privateCustomer),
      "STAFF dashboard excludes other clients' bookings even in the same tenant")
    assert.ok(!personalAgenda.includes(privatePhone),
      "STAFF individual panel must never expose customer contacts")
    assert.ok(!personalAgenda.includes("barbeiro-cliente@example.test"),
      "STAFF individual panel must never expose customer email")
    for (const action of ["Reatribuir", "Concluir", "Não compareceu"]) {
      assert.equal(await staff.getByRole("button", { name: action, exact: true }).count(), 0,
        "STAFF must not receive privileged administrative action: " + action)
    }
    assert.equal(await staff.getByRole("button", { name: "Cancelar", exact: true }).count(), 1,
      "STAFF can only cancel the own confirmed appointment displayed")
    assert.equal(await staff.getByRole("link", { name: "Reagendar", exact: true }).count(), 1,
      "STAFF has scoped rescheduling rather than access to the full agenda")

    await staff.getByRole("link", { name: "Semana", exact: true }).click()
    await staff.getByRole("region", { name: "Calendário semanal", exact: true }).waitFor()
    await assertCoreAccessibility(staff, "STAFF weekly calendar")
    await staff.setViewportSize({ width: 390, height: 844 })
    assert.equal(await staff.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
      "Mobile calendar scroll must stay inside its own container")
    const week = await staff.locator("main").innerText()
    assert.match(week, /Cliente do Barbeiro CI/)
    assert.ok(!week.includes(privateCustomer) && !week.includes(privatePhone),
      "STAFF weekly calendar must exclude colleagues and contacts")
    await open(staff, "/admin/" + shopB + "/barbeiro?date=2030-05-20&view=week&professional=123e4567-e89b-42d3-a456-426614174000")
    assert.match(await staff.locator("main").innerText(), /Cliente do Barbeiro CI/)
    assert.ok(!(await staff.locator("main").innerText()).includes(privateCustomer),
      "Weekly view cannot authorize a client-supplied professional")
    await staff.setViewportSize({ width: 1280, height: 900 })
    await open(staff, "/admin/" + shopB + "/barbeiro/planeamento?date=2030-05-20")
    await assertCoreAccessibility(staff, "Barber personal scheduling")
    const personalPlanning = await staff.locator("main").innerText()
    assert.match(personalPlanning, /Adicionar marcação de cliente/)
    assert.match(personalPlanning, /Horário semanal do profissional/)
    assert.match(personalPlanning, /Pausas, férias e indisponibilidade/)
    assert.equal(await staff.getByRole("button", { name: "Confirmar marcação e enviar email" }).isDisabled(), true,
      "CI email off: staff must not create an unnotified private booking")
    assert.ok(!personalPlanning.includes(privateCustomer),
      "Barber planning must never show general customer names")

    await open(staff, "/admin/" + shopB + "/barbeiro?date=2030-05-20")
    await open(staff, "/admin/" + shopB + "/professionals/convites")
    assert.equal(route(staff), "/admin/" + shopB + "/barbeiro",
      "STAFF must not issue or inspect invitations")

    // A manually typed administrative URL must not bypass the individual panel.
    await open(staff, "/admin/" + shopB + "/agenda?date=2030-05-20")
    assert.equal(route(staff), "/admin/" + shopB + "/barbeiro",
      "STAFF full agenda must redirect to the scoped individual panel")
    assert.ok(!(await staff.locator("main").innerText()).includes(privateCustomer),
      "STAFF must not read the general booking via a direct admin URL")
    await open(staff, "/admin/" + shopB + "/club")
    assert.equal(route(staff), "/admin/" + shopB + "/barbeiro",
      "STAFF must not open Club administration")
    await open(staff, "/admin/" + shopB + "/professionals")
    assert.equal(route(staff), "/admin/" + shopB + "/barbeiro",
      "STAFF must not open other professional profiles or account links")

    assert.equal(await staff.locator('a[href="/admin/' + shopB + '/contact"]').count(), 0,
      "STAFF must not see mailbox administration")
    response = await open(staff, "/admin/" + shopB + "/contact")
    assert.equal(response.status(), 404, "STAFF must not access contact email settings")
    response = await open(staff, "/admin/" + shopB + "/customers")
    assert.equal(response.status(), 404, "STAFF directory must be explicitly unavailable")
    assert.ok(!(await staff.locator("body").innerText()).includes(privatePhone))

    await open(staff, "/admin/" + shopA)
    assert.equal(route(staff), "/admin", "STAFF must not open other tenant")
    await assertNoPrivateCustomer(staff, "STAFF unauthorized tenant")
    await staffContext.close()

    console.log("FADEGO E2E tenant isolation PASS: OWNER agenda, STAFF own-booking isolation and admin-route denial, booking email and cross-tenant redaction.")
  } finally {
    await browser.close()
  }
}
main().catch((error) => {
  console.error("[ci-e2e-multitenant]", error)
  process.exitCode = 1
})


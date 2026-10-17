/* CI-only browser validation of two separate tenants and restricted staff access. */
const assert = require("node:assert/strict")
const { chromium } = require("/tmp/fadego-playwright/node_modules/playwright")

const base = "http://localhost:3000"
const shopA = "atelier-fadego-demo"
const shopB = "barbearia-norte-demo"
const privateCustomer = "Cliente Norte Fictício"
const privatePhone = "+351 919 999 991"

async function open(page, path) {
  const response = await page.goto(base + path, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  })
  assert.ok(response, "Navigation produced no HTTP response: " + path)
  return response
}

async function signIn(page, email) {
  await open(page, "/login")
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(process.env.FADEGO_DEMO_PASSWORD)
  await page.getByRole("button", { name: "Entrar", exact: true }).click()
  await page.waitForURL((url) => url.pathname === "/admin", { timeout: 25000 })
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
    await signIn(owner, process.env.FADEGO_DEMO_EMAIL)
    await open(owner, "/admin/" + shopA + "/contact")
    await assertCoreAccessibility(owner, "OWNER contact settings")
    const shopEmail = owner.locator('input[name="contactEmail"]')
    const senderAlias = owner.locator('input[name="senderAlias"]')
    assert.equal(await shopEmail.inputValue(), "shop-a@example.test")
    assert.equal(await owner.getByText("Ligação Google ainda indisponível", { exact: false }).count(), 1,
      "Gmail link remains closed until Google OAuth credentials are configured")
    assert.equal(await owner.getByRole("button", { name: "Ligar o meu Gmail com a Google" }).count(), 0,
      "No active Gmail OAuth action before explicit platform setup")
    assert.equal(await senderAlias.inputValue(), "")
    await shopEmail.fill("owner-test-inbox@example.test")
    await senderAlias.fill("cortes")
    await owner.getByRole("button", { name: "Guardar email" }).click()
    await owner.waitForURL((url) => url.searchParams.get("notice") === "saved", { timeout: 20000 })
    assert.equal(await owner.locator('input[name="contactEmail"]').inputValue(),
      "owner-test-inbox@example.test", "OWNER must save tenant-specific mailbox")
    assert.equal(await owner.locator('input[name="senderAlias"]').inputValue(),
      "cortes", "OWNER must save tenant-specific verified-domain alias")
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
    await open(staff, "/admin")
    const staffShops = await staff.locator("main").innerText()
    assert.match(staffShops, /Barbearia Norte/)
    assert.ok(!staffShops.includes("Atelier FADEGO"), "STAFF must not list tenant A")

    await open(staff, "/admin/" + shopB + "/agenda?date=2030-05-20")
    await assertCoreAccessibility(staff, "STAFF agenda")
    const staffAgenda = await staff.locator("main").innerText()
    assert.match(staffAgenda, /Cliente Norte Fictício/)
    assert.ok(!staffAgenda.includes(privatePhone), "STAFF agenda must redact phone")
    for (const action of ["Reatribuir", "Concluir", "Não compareceu"]) {
      assert.equal(await staff.getByRole("button", { name: action, exact: true }).count(), 0,
        "STAFF must not receive privileged agenda action: " + action)
    }
    assert.equal(await staff.getByRole("button", { name: /Cancelar marcação de/ }).count(), 0,
      "STAFF must not receive cancellation actions")

    await open(staff, "/admin/" + shopB + "/club")
    const staffClub = await staff.locator("main").innerText()
    assert.match(staffClub, /Cliente Norte Fictício/)
    assert.ok(!staffClub.includes(privatePhone), "STAFF Club must redact phone")

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

    console.log("FADEGO E2E tenant isolation PASS: OWNER agenda workflow, STAFF restrictions, browser form accessibility, mandatory booking email and cross-tenant redaction.")
  } finally {
    await browser.close()
  }
}
main().catch((error) => {
  console.error("[ci-e2e-multitenant]", error)
  process.exitCode = 1
})

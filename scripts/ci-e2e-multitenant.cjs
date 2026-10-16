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

    response = await open(anonymous, "/b/" + shopB)
    assert.equal(response.status(), 200)
    assert.match(await anonymous.locator("main").innerText(), /Corte Norte/)
    await assertNoPrivateCustomer(anonymous, "Anonymous public booking page")

    await open(anonymous, "/admin/" + shopB)
    assert.ok(["/admin", "/login"].includes(route(anonymous)), "Anonymous tenant dashboard must redirect")
    await anonymousContext.close()

    const ownerContext = await browser.newContext()
    const owner = await ownerContext.newPage()
    await signIn(owner, process.env.FADEGO_DEMO_EMAIL)
    await open(owner, "/admin/" + shopA + "/customers")
    const ownerCustomers = await owner.locator("main").innerText()
    assert.match(ownerCustomers, /João de Exemplo/)
    assert.ok(!ownerCustomers.includes(privateCustomer), "Cross-tenant customer leaked to OWNER")
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
    const staffAgenda = await staff.locator("main").innerText()
    assert.match(staffAgenda, /Cliente Norte Fictício/)
    assert.ok(!staffAgenda.includes(privatePhone), "STAFF agenda must redact phone")

    await open(staff, "/admin/" + shopB + "/club")
    const staffClub = await staff.locator("main").innerText()
    assert.match(staffClub, /Cliente Norte Fictício/)
    assert.ok(!staffClub.includes(privatePhone), "STAFF Club must redact phone")

    response = await open(staff, "/admin/" + shopB + "/customers")
    assert.equal(response.status(), 404, "STAFF directory must be explicitly unavailable")
    assert.ok(!(await staff.locator("body").innerText()).includes(privatePhone))

    await open(staff, "/admin/" + shopA)
    assert.equal(route(staff), "/admin", "STAFF must not open other tenant")
    await assertNoPrivateCustomer(staff, "STAFF unauthorized tenant")
    await staffContext.close()

    console.log("FADEGO E2E tenant isolation PASS: public booking, OWNER, STAFF, cross-tenant and redaction.")
  } finally {
    await browser.close()
  }
}
main().catch((error) => {
  console.error("[ci-e2e-multitenant]", error)
  process.exitCode = 1
})

/* Browser screenshots of the real built FADEGO UI, using synthetic CI fixtures. */
const { chromium } = require("/tmp/fadego-playwright/node_modules/playwright")
const { mkdirSync, writeFileSync, readFileSync } = require("node:fs")
const { join } = require("node:path")
const base = "http://localhost:3000"
const folder = "demo-shots"
mkdirSync(folder, { recursive: true })
const screens = []

async function capture(page, path, file, label) {
  const response = await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 25000 })
  if (!response || response.status() >= 400) {
    throw new Error("Screenshot " + file + ": HTTP " + response?.status())
  }
  await page.locator("main").first().waitFor({ state: "visible", timeout: 20000 })
  await page.evaluate(() => document.fonts.ready)
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  if (width.content > width.viewport + 2) {
    throw new Error("Horizontal overflow on " + path + ": " + width.content + "px content for " + width.viewport + "px viewport")
  }
  await page.screenshot({
    path: join(folder, file),
    type: "jpeg", quality: 82, fullPage: true, animations: "disabled",
  })
  screens.push({ path, file, label })
  console.log("Captured:", label)
}

async function authenticate(page) {
  await page.goto(base + "/login", { waitUntil: "domcontentloaded" })
  await page.locator('input[name="email"]').fill(process.env.FADEGO_DEMO_EMAIL)
  await page.locator('input[name="password"]').fill(process.env.FADEGO_DEMO_PASSWORD)
  await page.getByRole("button", { name: "Entrar", exact: true }).click()
  await page.waitForURL((url) => url.pathname === "/admin", { timeout: 25000 })
}

async function main() {
  const browser = await chromium.launch({
    channel: "chrome", headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  })
  try {
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 920 }, deviceScaleFactor: 1,
      locale: "pt-PT", timezoneId: "Europe/Lisbon",
    })
    const d = await desktop.newPage()
    await capture(d, "/", "01-inicio-desktop.jpg", "Início — Computador")
    await capture(d, "/login", "13-login-desktop.jpg", "Acesso reservado — Computador")
    await capture(d, "/b/atelier-fadego-demo", "02-reservas-desktop.jpg", "Reservas públicas — Computador")
    await capture(d, "/b/atelier-fadego-demo/recuperar", "15-recuperacao-desktop.jpg", "Recuperar reserva — Computador")
    await authenticate(d)
    await capture(d, "/admin", "03-barbearias-desktop.jpg", "Escolher barbearia — Computador")
    await capture(d, "/admin/atelier-fadego-demo", "04-painel-desktop.jpg", "Painel da barbearia — Computador")
    await capture(d, "/admin/atelier-fadego-demo/agenda?date=2030-05-20", "05-agenda-desktop.jpg", "Agenda — Computador")
    await capture(d, "/admin/atelier-fadego-demo/customers", "06-clientes-desktop.jpg", "Clientes — Computador")
    await capture(d, "/admin/atelier-fadego-demo/club", "07-club-desktop.jpg", "Club — Computador")
    await capture(d, "/super-admin", "08-superadmin-desktop.jpg", "Super Admin — Computador")

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
      isMobile: true, hasTouch: true, locale: "pt-PT", timezoneId: "Europe/Lisbon",
    })
    const m = await mobile.newPage()
    await capture(m, "/", "09-inicio-mobile.jpg", "Início — Telemóvel")
    await capture(m, "/login", "14-login-mobile.jpg", "Acesso reservado — Telemóvel")
    await capture(m, "/b/atelier-fadego-demo", "10-reservas-mobile.jpg", "Reservas públicas — Telemóvel")
    await capture(m, "/b/atelier-fadego-demo/recuperar", "16-recuperacao-mobile.jpg", "Recuperar reserva — Telemóvel")
    await authenticate(m)
    await capture(m, "/admin/atelier-fadego-demo", "11-painel-mobile.jpg", "Painel da barbearia — Telemóvel")
    await capture(m, "/admin/atelier-fadego-demo/agenda?date=2030-05-20", "12-agenda-mobile.jpg", "Agenda — Telemóvel")
    await desktop.close()
    await mobile.close()
  } finally {
    await browser.close()
  }
  const gallery = readFileSync("scripts/ci-visual-gallery.html", "utf8")
    .replace("__SCREENS__", JSON.stringify(screens))
  writeFileSync(join(folder, "ABRIR-DEMONSTRACAO.html"), gallery)
  writeFileSync(join(folder, "capturas.json"), JSON.stringify(screens, null, 2))
  console.log("FADEGO VISUAL DEMO PASS:", screens.length, "screenshots.")
}
main().catch((error) => {
  console.error("[ci-capture]", error)
  process.exitCode = 1
})

// Read-only external checks. Does not write, sign in or change any customer data.
import assert from "node:assert/strict"

const url = new URL(process.env.STAGING_URL || "https://fadego.duckdns.org")
assert.equal(url.protocol, "https:", "The test domain must use HTTPS")
assert.equal(url.hostname, "fadego.duckdns.org", "Unapproved staging domain")
assert.equal(url.pathname, "/", "Staging URL must be the site origin")

const username = process.env.STAGING_GATE_USER
const password = process.env.STAGING_GATE_PASSWORD
const basic = username && password
  ? "Basic " + Buffer.from(username + ":" + password, "utf8").toString("base64")
  : null

const response = await fetch(url, {
  redirect: "manual",
  signal: AbortSignal.timeout(10000),
  headers: {
    "User-Agent": "FADEGO-Staging-ReadOnly-Health/1.0",
    ...(basic ? { Authorization: basic } : {}),
  },
})
const code = response.status
if (code === 401 && !basic) {
  console.log("FADEGO staging HTTPS: reachable and protected by a login gate (HTTP 401).")
  process.exit(0)
}
assert.equal(code, 200, "HTTPS staging must return HTTP 200 after authentication")
const content = await response.text()
const robots = response.headers.get("x-robots-tag") || ""
assert.ok(
  /noindex/i.test(robots) || /noindex/i.test(content),
  "Staging must be excluded from search indexing",
)
assert.match(content, /FADEGO/i, "Public staging page must be FADEGO")
console.log("FADEGO staging HTTPS PASS: branded homepage, authenticated gate, noindex.")

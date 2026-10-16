// Read-only HTTPS preflight for the Owner-approved FADEGO test domain.
// Never logs credentials, submits forms, mutates server data or follows redirects.
import assert from "node:assert/strict"

const url = new URL(process.env.STAGING_URL || "https://fadego.duckdns.org")
assert.equal(url.origin, "https://fadego.duckdns.org", "Unexpected staging origin/port")
assert.equal(url.pathname, "/", "Staging URL must be the site root")
assert.equal(url.search, "", "Query parameters are not allowed")
assert.equal(url.hash, "", "Fragments are not allowed")
assert.equal(url.username, "", "Credentials must not appear in the URL")
assert.equal(url.password, "", "Credentials must not appear in the URL")

const username = process.env.STAGING_GATE_USER
const password = process.env.STAGING_GATE_PASSWORD
assert.equal(Boolean(username), Boolean(password), "Provide both gate credentials or neither")

const timeoutMs = 10000
const identity = { "User-Agent": "FADEGO-Staging-ReadOnly-Health/2.0" }
const get = async (path, authorization) =>
  fetch(new URL(path, url), {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      ...identity,
      ...(authorization ? { Authorization: authorization } : {}),
    },
  })

// Test the unauthenticated response first. A generic 401 is NOT evidence of
// the correct proxy: require an HTTP Basic challenge and noindex as well.
const closedGate = await get("/")
assert.equal(closedGate.status, 401, "Staging homepage must refuse anonymous access")
assert.match(
  closedGate.headers.get("www-authenticate") || "",
  /^Basic(?:\s|$)/i,
  "Staging must challenge with HTTP Basic",
)
assert.match(
  closedGate.headers.get("x-robots-tag") || "",
  /noindex/i,
  "Even the login gate must not be indexed",
)
await closedGate.body?.cancel()

if (!username || !password) {
  console.log(
    "FADEGO STAGING GATE ONLY: TLS valid, HTTP Basic and noindex confirmed; " +
    "authenticated application checks NOT performed.",
  )
  process.exit(0)
}

const badAuth = "Basic " + Buffer.from(
  username + ":" + password + "-incorrect",
  "utf8",
).toString("base64")
const rejected = await get("/", badAuth)
assert.equal(rejected.status, 401, "An incorrect gate password must not be accepted")
await rejected.body?.cancel()

const auth = "Basic " + Buffer.from(username + ":" + password, "utf8").toString("base64")
const home = await get("/", auth)
assert.equal(home.status, 200, "The authenticated homepage must return HTTP 200")
assert.match(
  home.headers.get("x-robots-tag") || "",
  /noindex/i,
  "Staging must have an X-Robots-Tag noindex header",
)
assert.match(
  home.headers.get("referrer-policy") || "",
  /no-referrer/i,
  "Staging must hide private booking links in referrers",
)
assert.match(
  home.headers.get("content-type") || "",
  /text\/html/i,
  "Authenticated homepage must return HTML",
)
assert.match(await home.text(), /FADEGO/i, "The homepage must identify FADEGO")

const login = await get("/login", auth)
assert.equal(login.status, 200, "The authenticated login screen must return HTTP 200")
assert.match(await login.text(), /FADEGO/i, "The login screen must be FADEGO")

const admin = await get("/admin", auth)
assert.ok([301, 302, 303, 307, 308].includes(admin.status),
  "The unauthenticated admin route must redirect to login")
const location = admin.headers.get("location") || ""
const loginTarget = new URL(location, url)
assert.equal(loginTarget.origin, url.origin, "Admin login must not redirect off-domain")
assert.equal(loginTarget.pathname, "/login", "Admin login must redirect to /login")
await admin.body?.cancel()

console.log(
  "FADEGO STAGING HTTPS PASS: TLS, Basic Auth, wrong password, noindex, " +
  "referrer privacy, branded pages and private admin redirect.",
)

import assert from "node:assert/strict"

const origin = "http://127.0.0.1:3000"

async function get(pathname) {
  const response = await fetch(origin + pathname, {
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "FADEGO-CI-Smoke/1.0" },
  })
  return { response, body: await response.text() }
}

const home = await get("/")
assert.equal(home.response.status, 200, "homepage must respond with HTTP 200")
assert.match(home.body, /FADEGO/i, "homepage must have FADEGO branding")
assert.match(home.body, /noindex/i, "site must stay unindexed before launch")

const login = await get("/login")
assert.equal(login.response.status, 200, "login page must respond with HTTP 200")
assert.match(login.body, /Entrar na plataforma/, "login form must render")

const admin = await get("/admin")
assert.ok(
  [302, 303, 307, 308].includes(admin.response.status),
  "anonymous admin access must redirect",
)
assert.match(
  admin.response.headers.get("location") ?? "",
  /\/login(?:$|[?#])/,
  "anonymous admin access must go to login",
)

const privateLookup = await get("/r/AAAAAAAA")
assert.equal(
  privateLookup.response.status,
  200,
  "an invalid booking code must show a generic unavailable page",
)
assert.match(
  privateLookup.body,
  /Marcação indisponível/i,
  "invalid booking codes must not disclose a booking",
)
assert.match(
  privateLookup.body,
  /no-referrer/i,
  "private booking pages must not forward bearer URLs via referrer",
)


// Private recovery mutations must not echo access tokens and must reject
// oversized JSON with 413, not misreport it as an ordinary invalid token.
const recoveryEndpoint = origin + "/api/public/recovery/redeem"
async function postRecovery(body) {
  return fetch(recoveryEndpoint, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json" },
    body,
  })
}

const invalidRecovery = await postRecovery("{invalid-json")
assert.equal(invalidRecovery.status, 400, "invalid recovery JSON must return 400")
assert.match(
  invalidRecovery.headers.get("cache-control") ?? "",
  /no-store/i,
  "recovery HTTP responses must not be cached",
)
assert.equal(invalidRecovery.headers.get("referrer-policy"), "no-referrer")
assert.deepEqual(await invalidRecovery.json(), { ok: false, code: "UNAVAILABLE" })

const oversizedRecovery = await postRecovery(
  JSON.stringify({ token: "x".repeat(8192) }),
)
assert.equal(oversizedRecovery.status, 413, "oversized recovery JSON must return 413")
assert.match(oversizedRecovery.headers.get("cache-control") ?? "", /no-store/i)
assert.equal(oversizedRecovery.headers.get("referrer-policy"), "no-referrer")
assert.deepEqual(await oversizedRecovery.json(), { ok: false, code: "UNAVAILABLE" })

console.log("FADEGO runtime HTTP smoke PASS: /, /login, /admin, /r/<invalid>, recovery HTTP bounds")

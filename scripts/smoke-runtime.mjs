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

console.log("FADEGO runtime HTTP smoke PASS: /, /login, /admin, /r/<invalid>")

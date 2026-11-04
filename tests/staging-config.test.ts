import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const config = readFileSync("deploy/staging/compose.yml", "utf8")
const caddy = readFileSync("deploy/staging/Caddyfile", "utf8")
const dockerfile = readFileSync("deploy/staging/Dockerfile", "utf8")
const ignore = readFileSync(".dockerignore", "utf8")

test("staging is isolated and cannot publish its database to the internet", () => {
  assert.match(config, /name: fadego-staging/)
  assert.match(config, /POSTGRES_DB: fadego_staging/)
  assert.match(config, /fadego_staging_db:\/var\/lib\/postgresql\/data/)
  assert.match(config, /"127\.0\.0\.1:3100:3000"/)
  assert.doesNotMatch(config, /"5432:5432"/)
  assert.match(config, /NEXTAUTH_URL: "https:\/\/fadego\.duckdns\.org"/)
  assert.match(config, /FADEGO_TRUST_PROXY_HOPS: "0"/)
})

test("only the opt-in gateway binds public ports and requires authentication", () => {
  assert.match(config, /gateway:\s*\n\s*profiles: \["dedicated-host"\]/)
  assert.match(caddy, /fadego\.duckdns\.org/)
  assert.match(caddy, /basic_auth \{/)
  assert.match(caddy, /FADEGO_STAGING_GATE_HASH/)
  assert.match(caddy, /X-Robots-Tag "noindex/)
  assert.match(caddy, /reverse_proxy app:3000/)
})

test("staging image excludes secrets and runs as an unprivileged user", () => {
  assert.match(dockerfile, /USER node/)
  assert.match(ignore, /node_modules/)
  assert.match(ignore, /\.env/)
  assert.match(ignore, /\.git/)
  assert.match(config, /FADEGO_STAGING_NEXTAUTH_SECRET/)
})

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { assertStagingPilotEnvironment } from "../lib/staging-pilot-policy"

const staging = {
  FADEGO_STAGING_SUPERVISOR_APPROVED: "1",
  FADEGO_STAGING_PILOT_SEED_APPROVED: "1",
  CI: "false",
  DATABASE_URL: "postgresql://fadego_staging:synthetic-only@127.0.0.1:5432/fadego_staging",
  NEXTAUTH_URL: "https://fadego.duckdns.org",
  BOOKING_EMAIL_PROVIDER: "disabled",
  GMAIL_LIVE_SEND_ENABLED: "false",
}
const releasePath = "/srv/fadego-staging/releases/a".concat("a".repeat(39))

test("synthetic pilot tool requires both staging approvals and an exact release path", () => {
  assert.doesNotThrow(() => assertStagingPilotEnvironment(staging, releasePath))
  for (const field of ["FADEGO_STAGING_SUPERVISOR_APPROVED", "FADEGO_STAGING_PILOT_SEED_APPROVED"]) {
    assert.throws(() => assertStagingPilotEnvironment({ ...staging, [field]: "0" }, releasePath))
    assert.throws(() => assertStagingPilotEnvironment({ ...staging, [field]: undefined }, releasePath))
  }
  assert.throws(() => assertStagingPilotEnvironment({ ...staging, CI: "true" }, releasePath))
  assert.throws(() => assertStagingPilotEnvironment(staging, "/srv/other-service"))
  assert.throws(() => assertStagingPilotEnvironment(staging, "/srv/fadego-staging/current"))
})

test("pilot tool cannot access production or another tenant database", () => {
  for (const database of [
    "postgresql://admin:fake@127.0.0.1:5432/fadego_staging",
    "postgresql://fadego_staging:fake@127.0.0.1:5432/fadego_production",
    "postgresql://fadego_staging:fake@10.1.1.1:5432/fadego_staging",
    "postgresql://fadego_staging:fake@localhost:5432/fadego_staging",
    "sqlite:file.db",
    "",
  ]) {
    assert.throws(() =>
      assertStagingPilotEnvironment({ ...staging, DATABASE_URL: database }, releasePath))
  }
  assert.throws(() =>
    assertStagingPilotEnvironment({ ...staging, NEXTAUTH_URL: "https://commercial.fadego.com" }, releasePath))
})

test("pilot seeding refuses live send and contains only visibly fictional identities", () => {
  for (const change of [
    { BOOKING_EMAIL_PROVIDER: "gmail" },
    { GMAIL_LIVE_SEND_ENABLED: "true" },
  ]) assert.throws(() =>
    assertStagingPilotEnvironment({ ...staging, ...change }, releasePath))
  const script = readFileSync("scripts/staging-pilot-seed.ts", "utf8")
  assert.match(script, /assertStagingPilotEnvironment\(process\.env/)
  assert.match(script, /status: "SUSPENDED"/)
  assert.match(script, /PILOT_SEED_REFUSED_EXISTING_TENANT/)
  assert.match(script, /platformRole !== "SUPER_ADMIN"/)
  assert.match(script, /example[.]test/)
  assert.doesNotMatch(script, /gmailSenderConnection[.]create|bookingEmailOutbox[.]create|payment[.]create/)
})

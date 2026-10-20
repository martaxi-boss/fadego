import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, test } from "node:test"
import { db, getPool } from "../lib/prisma"
import { gmailTenantReady, sendAuthorizedGmailBooking } from "../lib/gmail-delivery"
import { gmailOAuthConfig, sealGmailCredential } from "../lib/gmail-oauth"

const shops: string[] = []
const users: string[] = []
const fakeEnv = {
  GOOGLE_GMAIL_CLIENT_ID: "ci-fadego-pilot.apps.googleusercontent.com",
  GOOGLE_GMAIL_CLIENT_SECRET: "fake-only-google-oauth-secret-never-deploy",
  GMAIL_TOKEN_ENCRYPTION_SECRET: "ci-fake-only-encryption-key-not-for-deployment-1234",
  NEXTAUTH_URL: "https://fadego.duckdns.org",
  BOOKING_EMAIL_PROVIDER: "gmail",
  GMAIL_LIVE_SEND_ENABLED: "true",
}
const priorEnv = Object.fromEntries(
  Object.keys(fakeEnv).map((name) => [name, process.env[name]]),
)

after(async () => {
  for (const [name, value] of Object.entries(priorEnv)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  if (shops.length) {
    await db.gmailSenderConnection.deleteMany({ where: { barbershopId: { in: shops } } })
    await db.barbershop.deleteMany({ where: { id: { in: shops } } })
  }
  if (users.length) await db.user.deleteMany({ where: { id: { in: users } } })
  await db.$disconnect()
  await getPool().end()
})

test("Gmail pilot is isolated per tenant and suspension blocks a queued send", async () => {
  Object.assign(process.env, fakeEnv)
  const config = gmailOAuthConfig()
  assert.ok(config)
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12)
  const owner = await db.user.create({
    data: { email: "owner-" + suffix + "@example.test", passwordHash: "ci-fake-not-a-login-password" },
  })
  users.push(owner.id)
  const first = await db.barbershop.create({
    data: { name: "Barbearia Piloto", slug: "ci-gmail-pilot-" + suffix },
  })
  shops.push(first.id)
  const second = await db.barbershop.create({
    data: { name: "Outra Barbearia", slug: "ci-gmail-other-" + suffix },
  })
  shops.push(second.id)
  const approved = new Date(Date.now() - 60_000)
  await db.gmailSenderConnection.create({
    data: {
      barbershopId: first.id,
      email: "pilot@gmail.com",
      googleSubject: "ci-google-owner-" + suffix,
      authorizedByUserId: owner.id,
      sealedRefreshToken: sealGmailCredential("r".repeat(60), config, "refresh-token"),
      sendingEnabledAt: approved,
    },
  })
  assert.equal(await gmailTenantReady(first.slug), true)
  assert.equal(await gmailTenantReady(second.slug), false)

  let refreshCalls = 0
  let sendCalls = 0
  let suspendDuringRefresh = false
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async (input, init) => {
    const url = String(input)
    if (url === "https://oauth2.googleapis.com/token") {
      refreshCalls += 1
      if (suspendDuringRefresh) {
        await db.barbershop.update({ where: { id: first.id }, data: { status: "SUSPENDED" } })
      }
      return Response.json({ access_token: "a".repeat(60), token_type: "Bearer" })
    }
    if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
      sendCalls += 1
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer " + "a".repeat(60))
      const body = JSON.parse(String(init?.body)) as { raw: string }
      const mime = Buffer.from(body.raw, "base64url").toString("utf8")
      assert.match(mime, /pilot@gmail\.com/)
      assert.doesNotMatch(mime, /help\.onlinefuture@gmail\.com/)
      return Response.json({ id: "ci-gmail-fake-only" })
    }
    throw new Error("Unapproved external request in Gmail CI test")
  }) as typeof fetch

  let sendAuthorizationChecks = 0
  const job = { barbershopId: first.id, createdAt: new Date(Date.now() - 5_000) }
  const makeMessage = () => ({
    from: "Barbearia Piloto <pilot@gmail.com>",
    to: "customer@example.test",
    subject: "Confirmacao ficticia",
    text: "Reserva ficticia: CI, sem envio real.",
  })
  const beforeSend = async () => { sendAuthorizationChecks += 1; return true }
  try {
    assert.equal(await sendAuthorizedGmailBooking(job, makeMessage, beforeSend), "accepted")
    assert.equal(sendCalls, 1)
    assert.equal(sendAuthorizationChecks, 1)

    await db.barbershop.update({ where: { id: first.id }, data: { status: "SUSPENDED" } })
    assert.equal(await gmailTenantReady(first.slug), false)
    const earlierRefresh = refreshCalls
    assert.equal(await sendAuthorizedGmailBooking(job, makeMessage, beforeSend), "disabled")
    assert.equal(refreshCalls, earlierRefresh, "Suspended tenant must not refresh Google tokens")
    assert.equal(sendCalls, 1)

    await db.barbershop.update({ where: { id: first.id }, data: { status: "ACTIVE" } })
    suspendDuringRefresh = true
    assert.equal(await sendAuthorizedGmailBooking(job, makeMessage, beforeSend), "disabled")
    assert.equal(sendCalls, 1, "Suspending during refresh must block the later send")
    assert.equal(sendAuthorizationChecks, 1)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test("expired Gmail token closes only its tenant; a temporary Google outage keeps consent", async () => {
  Object.assign(process.env, fakeEnv)
  const config = gmailOAuthConfig()
  assert.ok(config)
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12)
  const owner = await db.user.create({
    data: { email: "owner-expired-" + suffix + "@example.test", passwordHash: "ci-not-login" },
  })
  users.push(owner.id)
  const expired = await db.barbershop.create({
    data: { name: "Barbearia Com Token Expirado", slug: "ci-gmail-expired-" + suffix },
  })
  const healthy = await db.barbershop.create({
    data: { name: "Barbearia Independente", slug: "ci-gmail-healthy-" + suffix },
  })
  shops.push(expired.id, healthy.id)
  const approved = new Date(Date.now() - 120_000)
  const firstToken = sealGmailCredential("E".repeat(60), config, "refresh-token")
  const secondToken = sealGmailCredential("H".repeat(60), config, "refresh-token")
  for (const [shop, mailbox, token] of [
    [expired, "expired@gmail.com", firstToken],
    [healthy, "healthy@gmail.com", secondToken],
  ] as const) {
    await db.gmailSenderConnection.create({
      data: {
        barbershopId: shop.id,
        email: mailbox,
        googleSubject: "ci-google-" + shop.id,
        sealedRefreshToken: token,
        authorizedByUserId: owner.id,
        sendingEnabledAt: approved,
      },
    })
  }

  const makeMessage = () => ({
    from: "Barbearia Com Token Expirado <expired@gmail.com>",
    to: "customer@example.test",
    subject: "Teste sem envio",
    text: "Nunca enviar este email",
  })
  const noSend = async () => {
    throw new Error("A failed Google refresh must never initiate Gmail sending")
  }
  const originalFetch = globalThis.fetch
  let googleCalls = 0
  try {
    assert.equal(await gmailTenantReady(expired.slug), true)
    assert.equal(await gmailTenantReady(healthy.slug), true)
    globalThis.fetch = (async (input) => {
      assert.equal(String(input), "https://oauth2.googleapis.com/token")
      googleCalls += 1
      return Response.json({ error: "invalid_grant" }, { status: 400 })
    }) as typeof fetch
    const firstJob = { barbershopId: expired.id, createdAt: new Date(Date.now() - 60_000) }
    assert.equal(await sendAuthorizedGmailBooking(firstJob, makeMessage, noSend), "refused")
    assert.equal(await gmailTenantReady(expired.slug), false)
    assert.equal(await gmailTenantReady(healthy.slug), true)
    assert.equal(await db.gmailSenderConnection.findUnique({
      where: { barbershopId: expired.id },
    }), null, "Expired Google credentials must require the owner to reconnect")

    globalThis.fetch = (async (input) => {
      assert.equal(String(input), "https://oauth2.googleapis.com/token")
      googleCalls += 1
      return Response.json({ error: "temporarily_unavailable" }, { status: 503 })
    }) as typeof fetch
    const otherJob = { barbershopId: healthy.id, createdAt: new Date(Date.now() - 60_000) }
    assert.equal(await sendAuthorizedGmailBooking(otherJob, makeMessage, noSend), "refused")
    assert.equal(await gmailTenantReady(healthy.slug), true,
      "Transient Google failures must not revoke a healthy tenant's consent")
    assert.equal(googleCalls, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

import assert from "node:assert/strict"
import { test } from "node:test"
import {
  GOOGLE_GMAIL_SEND_SCOPE,
  gmailAuthorizeUrl, gmailLiveSendReady, gmailOAuthConfig, gmailStateHash,
  randomGmailChallenge, sealGmailCredential, openGmailCredential,
  exchangeGmailAuthorizationCode, refreshGmailAccessToken, fetchGmailIdentity,
  encodeGmailRawMessage, postGmailMessage,
} from "../lib/gmail-oauth"

const env = {
  GOOGLE_GMAIL_CLIENT_ID: "example.apps.googleusercontent.com",
  GOOGLE_GMAIL_CLIENT_SECRET: "fake-test-only-OAuth-client-secret",
  GMAIL_TOKEN_ENCRYPTION_SECRET: "this-is-a-fake-ci-secret-only-not-for-reuse-12345",
  NEXTAUTH_URL: "https://fadego.duckdns.org",
  BOOKING_EMAIL_PROVIDER: "gmail",
}
const config = gmailOAuthConfig(env)
if (!config) throw new Error("Invalid test fixture")

test("OAuth defaults to disabled and requires a pinned HTTPS callback", () => {
  assert.equal(gmailOAuthConfig({}), null)
  assert.equal(gmailOAuthConfig({ ...env, NEXTAUTH_URL: "http://fadego.duckdns.org" }), null)
  assert.equal(gmailOAuthConfig({ ...env, NEXTAUTH_URL: "https://fadego.duckdns.org/path" }), null)
  assert.equal(gmailOAuthConfig({ ...env, GOOGLE_GMAIL_CLIENT_SECRET: "" }), null)
  assert.equal(gmailLiveSendReady(env), false)
  assert.equal(gmailLiveSendReady({ ...env, GMAIL_LIVE_SEND_ENABLED: "false" }), false)
  assert.equal(gmailLiveSendReady({ ...env, GMAIL_LIVE_SEND_ENABLED: "true" }), true)
  assert.equal(config.redirectUri, "https://fadego.duckdns.org/api/integrations/gmail/callback")
})

test("OAuth requests least privilege send, offline refresh, one-time state and PKCE", () => {
  const a = randomGmailChallenge()
  const b = randomGmailChallenge()
  assert.notEqual(a.state, b.state)
  assert.notEqual(a.verifier, b.verifier)
  assert.equal(gmailStateHash(a.state).length, 64)
  assert.equal(a.challenge.length, 43)
  const url = new URL(gmailAuthorizeUrl(config, a.state, a.challenge))
  assert.equal(url.origin, "https://accounts.google.com")
  assert.equal(url.searchParams.get("state"), a.state)
  assert.equal(url.searchParams.get("code_challenge_method"), "S256")
  assert.equal(url.searchParams.get("code_challenge"), a.challenge)
  assert.equal(url.searchParams.get("access_type"), "offline")
  assert.match(url.searchParams.get("prompt") || "", /consent/)
  const scopes = url.searchParams.get("scope")?.split(" ") || []
  assert.deepEqual(scopes, ["openid", "email", GOOGLE_GMAIL_SEND_SCOPE])
  assert.equal(scopes.includes("https://mail.google.com/"), false)
})

test("OAuth verifier and refresh token are encrypted with separate keys", () => {
  const secret = "refresh-example-token-without-real-credentials"
  const enc1 = sealGmailCredential(secret, config, "refresh-token")
  const enc2 = sealGmailCredential(secret, config, "refresh-token")
  assert.notEqual(enc1, enc2)
  assert.equal(openGmailCredential(enc1, config, "refresh-token"), secret)
  assert.ok(!enc1.includes(secret))
  assert.throws(() => openGmailCredential(enc1, config, "verifier"))
  assert.throws(() => openGmailCredential(enc1.slice(0,-3) + "xxxx", config, "refresh-token"))
})

test("authorization requires real refresh token and send permission", async () => {
  const challenge = randomGmailChallenge()
  const network: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://oauth2.googleapis.com/token")
    const body = init?.body as URLSearchParams
    assert.equal(body.get("grant_type"), "authorization_code")
    assert.equal(body.get("redirect_uri"), config.redirectUri)
    assert.equal(body.get("code_verifier"), challenge.verifier)
    return Response.json({
      access_token: "access-test-token-" + "x".repeat(40),
      refresh_token: "refresh-test-token-" + "y".repeat(40),
      token_type: "Bearer", scope: "openid email " + GOOGLE_GMAIL_SEND_SCOPE,
    })
  }
  const token = await exchangeGmailAuthorizationCode(config, "fake-code", challenge.verifier, network)
  assert.match(token.refreshToken, /refresh-test-token/)
  const bad: typeof fetch = async () => Response.json({
    access_token: "x".repeat(40), token_type: "Bearer",
    scope: GOOGLE_GMAIL_SEND_SCOPE,
  })
  await assert.rejects(exchangeGmailAuthorizationCode(config, "fake-code", challenge.verifier, bad), /CONSENT/)
})

test("Google verified identity is mandatory and refresh uses only offline credentials", async () => {
  const verified: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://openidconnect.googleapis.com/v1/userinfo")
    assert.match(String(init?.headers instanceof Headers ? init.headers.get("Authorization") : JSON.stringify(init?.headers)), /Bearer/)
    return Response.json({ sub: "google-sub-id", email: "TESTER@GMAIL.COM", email_verified: true })
  }
  assert.deepEqual(await fetchGmailIdentity("dummy-token", verified), {
    sub: "google-sub-id", email: "tester@gmail.com",
  })
  await assert.rejects(fetchGmailIdentity("dummy-token", async () =>
    Response.json({ sub: "google-sub-id", email: "tester@gmail.com", email_verified: false })), /NOT_VERIFIED/)
  const refresh: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://oauth2.googleapis.com/token")
    const params = init?.body as URLSearchParams
    assert.equal(params.get("grant_type"), "refresh_token")
    return Response.json({ access_token: "a".repeat(60), token_type: "Bearer" })
  }
  const got = await refreshGmailAccessToken(config, "r".repeat(60), refresh)
  assert.equal(got.accessToken, "a".repeat(60))
})

test("refresh distinguishes revoked Google grants from temporary provider failures", async () => {
  const revoked: typeof fetch = async (url, options) => {
    assert.equal(String(url), "https://oauth2.googleapis.com/token")
    assert.equal((options?.body as URLSearchParams).get("grant_type"), "refresh_token")
    return Response.json({ error: "invalid_grant", error_description: "not shown" }, { status: 400 })
  }
  await assert.rejects(
    refreshGmailAccessToken(config, "r".repeat(60), revoked),
    /GMAIL_REFRESH_REVOKED/,
  )
  const outage: typeof fetch = async () =>
    Response.json({ error: "temporarily_unavailable" }, { status: 503 })
  await assert.rejects(
    refreshGmailAccessToken(config, "r".repeat(60), outage),
    /GMAIL_TOKEN_REQUEST_REJECTED/,
  )
  const wrongError: typeof fetch = async () =>
    Response.json({ error: "invalid_client" }, { status: 400 })
  await assert.rejects(
    refreshGmailAccessToken(config, "r".repeat(60), wrongError),
    /GMAIL_TOKEN_REQUEST_REJECTED/,
  )
  const badBody: typeof fetch = async () =>
    new Response("not-json", { status: 400 })
  await assert.rejects(
    refreshGmailAccessToken(config, "r".repeat(60), badBody),
    /GMAIL_TOKEN_REQUEST_REJECTED/,
  )
})

test("send API encodes RFC2822 UTF-8 message and never forges another mailbox", async () => {
  const msg = {
    from: "Barbearia do João <owner@gmail.com>",
    to: "cliente@example.test",
    replyTo: "respostas@example.test",
    subject: "Reserva confirmada — João",
    text: "Olá cliente. Reserva às 15 horas.",
  }
  const raw = encodeGmailRawMessage("owner@gmail.com", msg)
  const mime = Buffer.from(raw, "base64url").toString("utf8")
  assert.match(mime, /From: =\?UTF-8\?B\?/)
  assert.match(mime, /<owner@gmail.com>/)
  assert.match(mime, /Reply-To: <respostas@example.test>/)
  assert.match(mime, /Content-Transfer-Encoding: base64/)
  assert.throws(() => encodeGmailRawMessage("different@gmail.com", msg), /MUST_MATCH/)
  assert.throws(() => encodeGmailRawMessage("owner@gmail.com", { ...msg, to: "target\r\nBcc:evil@example.test" }))
  let calls = 0
  const network: typeof fetch = async (url, options) => {
    calls++
    assert.equal(String(url), "https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
    assert.equal((options?.headers as Record<string,string>).Authorization, "Bearer access-token")
    const sent = JSON.parse(options?.body as string)
    assert.equal(sent.raw, raw)
    return Response.json({ id: "gmail-fake-id", threadId: "fake-thread" })
  }
  assert.equal(await postGmailMessage("access-token", "owner@gmail.com", msg, network), "accepted")
  assert.equal(calls, 1)
  assert.equal(await postGmailMessage("access-token", "owner@gmail.com", msg, async () =>
    new Response(null, { status: 403 })), "refused")
  assert.equal(await postGmailMessage("access-token", "owner@gmail.com", msg, async () => {
    throw new Error("simulated network timeout")
  }), "uncertain")
  assert.equal(await postGmailMessage("access-token", "owner@gmail.com", msg, async () =>
    new Response(null, { status: 502 })), "uncertain")
})

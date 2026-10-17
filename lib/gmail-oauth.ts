import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto"
import { z } from "zod"

export const GOOGLE_GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
const GOOGLE_GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
const CALLBACK_PATH = "/api/integrations/gmail/callback"
const noRedirect = "manual" as const

type GmailOAuthEnvironment = {
  GOOGLE_GMAIL_CLIENT_ID?: string
  GOOGLE_GMAIL_CLIENT_SECRET?: string
  GMAIL_TOKEN_ENCRYPTION_SECRET?: string
  NEXTAUTH_URL?: string
  BOOKING_EMAIL_PROVIDER?: string
  GMAIL_LIVE_SEND_ENABLED?: string
}

export type GmailConfig = {
  clientId: string
  clientSecret: string
  encryptionSecret: string
  origin: string
  redirectUri: string
}

export type GmailEmail = {
  from: string
  to: string
  subject: string
  text: string
  replyTo?: string
}

export type GoogleIdentity = { sub: string; email: string }

export const gmailOAuthConfig = (env: GmailOAuthEnvironment = process.env): GmailConfig | null => {
  const clientId = env.GOOGLE_GMAIL_CLIENT_ID?.trim() || ""
  const clientSecret = env.GOOGLE_GMAIL_CLIENT_SECRET || ""
  const encryptionSecret = env.GMAIL_TOKEN_ENCRYPTION_SECRET || ""
  const origin = env.NEXTAUTH_URL?.trim() || ""
  if (!clientId.endsWith(".apps.googleusercontent.com") ||
      clientSecret.length < 12 || Buffer.byteLength(encryptionSecret) < 32) return null
  try {
    const url = new URL(origin)
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password ||
        url.search || url.hash || url.port || url.pathname !== "/") return null
    return {
      clientId, clientSecret, encryptionSecret,
      origin: url.origin,
      redirectUri: new URL(CALLBACK_PATH, url.origin).toString(),
    }
  } catch {
    return null
  }
}

// The second, global deployment/owner gate defaults closed, even after OAuth consent.
export const gmailLiveSendReady = (env: GmailOAuthEnvironment = process.env) =>
  env.BOOKING_EMAIL_PROVIDER === "gmail" &&
  env.GMAIL_LIVE_SEND_ENABLED === "true" &&
  gmailOAuthConfig(env) !== null

export const randomGmailChallenge = () => {
  const state = randomBytes(32).toString("base64url")
  const verifier = randomBytes(64).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  return { state, verifier, challenge }
}

export const gmailStateHash = (state: string) =>
  createHash("sha256").update(state).digest("hex")

export const gmailAuthorizeUrl = (
  config: GmailConfig, state: string, challenge: string,
) => {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    throw new Error("GMAIL_INVALID_OAUTH_CHALLENGE")
  }
  const url = new URL(GOOGLE_AUTH_URL)
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", config.redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", "openid email " + GOOGLE_GMAIL_SEND_SCOPE)
  url.searchParams.set("access_type", "offline")
  url.searchParams.set("prompt", "consent select_account")
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", challenge)
  url.searchParams.set("code_challenge_method", "S256")
  return url.toString()
}

const deriveKey = (secret: string, purpose: string) => {
  if (Buffer.byteLength(secret) < 32) throw new Error("GMAIL_ENCRYPTION_KEY_UNAVAILABLE")
  return Buffer.from(hkdfSync(
    "sha256", Buffer.from(secret), Buffer.from("fadego-gmail-oauth-v1"),
    Buffer.from(purpose), 32,
  ))
}

export const sealGmailCredential = (
  plaintext: string,
  config: GmailConfig,
  purpose: "verifier" | "refresh-token",
) => {
  if (!plaintext || plaintext.length > 4096) throw new Error("INVALID_GMAIL_SECRET_INPUT")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", deriveKey(config.encryptionSecret, purpose), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return "v1:" + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")
}

export const openGmailCredential = (
  sealed: string,
  config: GmailConfig,
  purpose: "verifier" | "refresh-token",
) => {
  if (!/^v1:[A-Za-z0-9_-]{40,6000}$/.test(sealed)) throw new Error("INVALID_GMAIL_CIPHERTEXT")
  const bytes = Buffer.from(sealed.slice(3), "base64url")
  if (bytes.length < 29) throw new Error("INVALID_GMAIL_CIPHERTEXT")
  const decipher = createDecipheriv(
    "aes-256-gcm", deriveKey(config.encryptionSecret, purpose), bytes.subarray(0, 12),
  )
  decipher.setAuthTag(bytes.subarray(12, 28))
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")
}

const formPost = async (data: URLSearchParams, fetcher: typeof fetch) => {
  const response = await fetcher(GOOGLE_TOKEN_URL, {
    method: "POST", redirect: noRedirect, signal: AbortSignal.timeout(12000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: data,
  })
  if (!response.ok) {
    // Google can permanently invalidate a Gmail refresh token (revocation,
    // 7-day Testing expiry). Only this explicit response is definitive.
    // Network/5xx and other 4xx errors must NOT disconnect a tenant.
    if (response.status === 400 && data.get("grant_type") === "refresh_token") {
      let failure: unknown
      try { failure = await response.json() } catch { /* invalid error body */ }
      if (failure && typeof failure === "object" &&
          "error" in failure && failure.error === "invalid_grant") {
        throw new Error("GMAIL_REFRESH_REVOKED")
      }
    }
    await response.body?.cancel()
    throw new Error("GMAIL_TOKEN_REQUEST_REJECTED")
  }
  const raw: unknown = await response.json()
  const parsed = z.object({
    access_token: z.string().min(20),
    token_type: z.string(),
    refresh_token: z.string().min(20).optional(),
    scope: z.string().optional(),
  }).safeParse(raw)
  if (!parsed.success || parsed.data.token_type.toLowerCase() !== "bearer") {
    throw new Error("GMAIL_INVALID_TOKEN_RESPONSE")
  }
  return parsed.data
}

export const exchangeGmailAuthorizationCode = async (
  config: GmailConfig, code: string, verifier: string, fetcher: typeof fetch = fetch,
) => {
  if (!code || code.length > 4096 || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) {
    throw new Error("GMAIL_INVALID_OAUTH_EXCHANGE")
  }
  const data = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    code, code_verifier: verifier,
  })
  const token = await formPost(data, fetcher)
  if (!token.refresh_token || !token.scope?.split(" ").includes(GOOGLE_GMAIL_SEND_SCOPE)) {
    throw new Error("GMAIL_SEND_CONSENT_UNAVAILABLE")
  }
  return { accessToken: token.access_token, refreshToken: token.refresh_token }
}

export const refreshGmailAccessToken = async (
  config: GmailConfig, refreshToken: string, fetcher: typeof fetch = fetch,
) => {
  if (!refreshToken || refreshToken.length > 4096) throw new Error("GMAIL_INVALID_REFRESH_TOKEN")
  const form = new URLSearchParams({
    client_id: config.clientId, client_secret: config.clientSecret,
    grant_type: "refresh_token", refresh_token: refreshToken,
  })
  const token = await formPost(form, fetcher)
  return { accessToken: token.access_token, rotatedRefreshToken: token.refresh_token }
}

export const fetchGmailIdentity = async (
  accessToken: string, fetcher: typeof fetch = fetch,
): Promise<GoogleIdentity> => {
  const response = await fetcher(GOOGLE_USERINFO_URL, {
    method: "GET", redirect: noRedirect, signal: AbortSignal.timeout(12000),
    headers: { Authorization: "Bearer " + accessToken },
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error("GMAIL_IDENTITY_UNAVAILABLE")
  }
  const raw: unknown = await response.json()
  const parsed = z.object({
    sub: z.string().min(1).max(255),
    email: z.email().max(254),
    email_verified: z.literal(true),
  }).safeParse(raw)
  if (!parsed.success) throw new Error("GMAIL_IDENTITY_NOT_VERIFIED")
  return { sub: parsed.data.sub, email: parsed.data.email.toLowerCase() }
}

const strictMailbox = (raw: string) => {
  const value = z.email().max(254).safeParse(raw)
  if (!value.success || /[\r\n<>]/.test(raw)) throw new Error("GMAIL_INVALID_EMAIL_HEADER")
  return value.data.toLowerCase()
}

const rfc2047 = (value: string) => "=?UTF-8?B?" + Buffer.from(value, "utf8").toString("base64") + "?="

// Gmail requires RFC 2822 MIME content encoded as base64url in messages.send.
export const encodeGmailRawMessage = (mailbox: string, message: GmailEmail) => {
  const account = strictMailbox(mailbox)
  const match = /^(.{1,80}) <([^<>\s]+)>$/.exec(message.from)
  if (!match || strictMailbox(match[2]) !== account) {
    throw new Error("GMAIL_FROM_MUST_MATCH_AUTHORIZED_ACCOUNT")
  }
  const display = match[1].replace(/[\r\n\x00-\x1f\x7f<>]+/g, " ").trim()
  if (!display) throw new Error("GMAIL_INVALID_DISPLAY_NAME")
  const to = strictMailbox(message.to)
  const replyTo = message.replyTo ? strictMailbox(message.replyTo) : null
  if (!message.subject || /[\r\n\x00-\x1f\x7f]/.test(message.subject) ||
      !message.text || message.text.length > 100000) {
    throw new Error("GMAIL_INVALID_MESSAGE")
  }
  const headers = [
    "From: " + rfc2047(display) + " <" + account + ">",
    "To: <" + to + ">",
    ...(replyTo ? ["Reply-To: <" + replyTo + ">"] : []),
    "Subject: " + rfc2047(message.subject),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ]
  const base64 = Buffer.from(message.text, "utf8").toString("base64")
  const wrapped = base64.match(/.{1,76}/g)?.join("\r\n") || ""
  return Buffer.from(headers.join("\r\n") + "\r\n\r\n" + wrapped + "\r\n")
    .toString("base64url")
}

// Gmail messages.send has no provider idempotency key. Ambiguous outcomes
// must not be automatically retried or double-send a private booking code.
export const postGmailMessage = async (
  accessToken: string, mailbox: string, message: GmailEmail,
  fetcher: typeof fetch = fetch,
): Promise<"accepted" | "refused" | "uncertain"> => {
  const raw = encodeGmailRawMessage(mailbox, message)
  try {
    const response = await fetcher(GOOGLE_GMAIL_SEND_URL, {
      method: "POST", redirect: noRedirect, signal: AbortSignal.timeout(12000),
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    })
    if (!response.ok) {
      await response.body?.cancel()
      return response.status >= 400 && response.status < 500 ? "refused" : "uncertain"
    }
    const data: unknown = await response.json()
    return data && typeof data === "object" && "id" in data &&
      typeof data.id === "string" && data.id.length > 0 ? "accepted" : "uncertain"
  } catch {
    return "uncertain"
  }
}

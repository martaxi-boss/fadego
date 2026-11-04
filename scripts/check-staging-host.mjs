/**
 * Read-only HTTPS/DNS evidence for the owner-selected staging hostname.
 * Runs without credentials; never updates DNS or the VPS and never fails CI.
 */
import { resolve4, resolve6 } from "node:dns/promises"
import { mkdirSync, writeFileSync } from "node:fs"

const hostname = "fadego.duckdns.org"
const date = new Date().toISOString()
const result = {
  hostname,
  checkedAtUtc: date,
  dns: { a: [], aaaa: [], reachable: false },
  https: { status: "NOT_CHECKED", responseStatus: null },
}

async function resolveRecords(fn) {
  try {
    return await fn(hostname)
  } catch {
    return []
  }
}

const [a, aaaa] = await Promise.all([resolveRecords(resolve4), resolveRecords(resolve6)])
result.dns = { a, aaaa, reachable: a.length > 0 || aaaa.length > 0 }

if (result.dns.reachable) {
  try {
    const response = await fetch("https://" + hostname + "/", {
      redirect: "manual",
      signal: AbortSignal.timeout(9000),
      headers: { "User-Agent": "FADEGO-CI-Staging-Diagnostic/1.0" },
    })
    result.https.responseStatus = response.status
    if (response.status === 401) {
      result.https.status = "HTTPS_LOGIN_GATE_VISIBLE"
    } else if (response.status === 200) {
      result.https.status = "HTTP_200_WITHOUT_TEST_GATE_CHECK_CONFIGURATION"
    } else if (response.status >= 300 && response.status < 400) {
      result.https.status = "HTTPS_REDIRECT_VERIFY_TARGET"
    } else {
      result.https.status = "HTTPS_RESPONSE_VERIFY_CONFIGURATION"
    }
    await response.body?.cancel().catch(() => undefined)
  } catch {
    result.https.status = "HTTPS_NOT_ACCESSIBLE_OR_TLS_INVALID"
  }
} else {
  result.https.status = "DNS_NOT_RESOLVING"
}

mkdirSync("demo-shots", { recursive: true })
writeFileSync("demo-shots/staging-network-status.json", JSON.stringify(result, null, 2) + "\n")
console.log("FADEGO STAGING DNS/HTTPS (read-only):", JSON.stringify(result))
console.log("This is diagnostic evidence, not deployment authorization or proof of app identity.")

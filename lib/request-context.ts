import { isIP } from "node:net"

const MAX_FORWARDING_HEADER_LENGTH = 1024
const MAX_FORWARDING_ENTRIES = 12
const MAX_TRUSTED_PROXY_HOPS = 5

// The deployment must set the number of trusted proxies that append to XFF.
// Otherwise use a shared anti-abuse signal rather than accepting a spoofed IP.
export const sourceIpFromHeaders = (
  headers: Headers,
  trustedProxyHops = Number(process.env.FADEGO_TRUST_PROXY_HOPS ?? "0"),
) => {
  if (
    !Number.isSafeInteger(trustedProxyHops) ||
    trustedProxyHops < 1 ||
    trustedProxyHops > MAX_TRUSTED_PROXY_HOPS
  ) {
    return "unknown"
  }

  const value = headers.get("x-forwarded-for")
  if (!value || value.length > MAX_FORWARDING_HEADER_LENGTH) return "unknown"

  const chain = value.split(",").map((part) => part.trim())
  if (
    chain.length < trustedProxyHops ||
    chain.length > MAX_FORWARDING_ENTRIES
  ) {
    return "unknown"
  }

  const source = chain[chain.length - trustedProxyHops]
  return source && isIP(source) !== 0 ? source.toLowerCase() : "unknown"
}

import { barbershopSlugSchema } from "@/lib/validation"

export const RESERVED_TENANT_LABELS = new Set([
  "admin", "api", "app", "auth", "cliente", "clientes", "equipa", "gmail",
  "login", "mail", "portal", "reservas", "suporte", "www",
])

const domainLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

// A wildcard TLS/DNS + trusted reverse proxy must be certified *before*
// activating this toggle in an environment. It performs no external DNS writes.
export const tenantBaseDomain = (env: NodeJS.ProcessEnv = process.env): string | null => {
  if (env.FADEGO_TENANT_SUBDOMAINS_READY !== "true") return null
  const value = env.FADEGO_TENANT_BASE_DOMAIN?.trim().toLowerCase() ?? ""
  if (!value || value.length > 253) return null
  const labels = value.split(".")
  if (labels.length < 2 || labels.some((label) => !domainLabel.test(label))) return null
  if (labels.at(-1)?.length === 1 || /^\d+$/.test(labels.at(-1) ?? "")) return null
  const platform = env.NEXTAUTH_URL
  if (!platform) return null
  try {
    const url = new URL(platform)
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) return null
    if (url.hostname === value || url.hostname.endsWith("." + value)) {
      // The platform root must never be interpreted as a tenant;
      // under the same DNS zone, the host matcher still excludes it.
      return value
    }
    return value
  } catch {
    return null
  }
}

export const tenantSubdomainUrl = (
  slug: string, env: NodeJS.ProcessEnv = process.env,
): string | null => {
  const base = tenantBaseDomain(env)
  if (!base || !barbershopSlugSchema.safeParse(slug).success ||
      RESERVED_TENANT_LABELS.has(slug)) return null
  return "https://" + slug + "." + base
}

export const tenantFromHostname = (
  rawHost: string, baseDomain: string | null, platformHost = "",
): string | null => {
  if (!baseDomain) return null
  const host = rawHost.trim().toLowerCase().replace(/:\d{1,5}$/, "")
  if (host === platformHost.toLowerCase() || !host.endsWith("." + baseDomain)) return null
  const slug = host.slice(0, -baseDomain.length - 1)
  if (!slug || slug.includes(".") || RESERVED_TENANT_LABELS.has(slug) ||
      !barbershopSlugSchema.safeParse(slug).success) return null
  return slug
}

export type TenantHostRoute =
  | { kind: "rewrite"; path: string }
  | { kind: "platform-redirect"; path: string }
  | { kind: "next" }
  | { kind: "not-found" }

export const tenantHostRoute = (slug: string, path: string): TenantHostRoute => {
  if (path === "/") return { kind: "rewrite", path: "/espaco/" + slug }
  if (path === "/marcar") return { kind: "rewrite", path: "/b/" + slug }
  if (path === "/cliente") return { kind: "rewrite", path: "/b/" + slug + "/recuperar" }
  if (path === "/gestao") return { kind: "platform-redirect", path: "/admin/" + slug }
  if (path === "/equipa") return { kind: "platform-redirect", path: "/admin/" + slug + "/agenda" }
  if (path === "/login") return { kind: "platform-redirect", path: "/login?acesso=equipa" }
  if (path === "/b/" + slug || path === "/b/" + slug + "/recuperar" ||
      path === "/espaco/" + slug) {
    return { kind: "next" }
  }
  return { kind: "not-found" }
}

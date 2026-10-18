import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { tenantBaseDomain, tenantFromHostname, tenantHostRoute } from "@/lib/tenant-subdomains"

// Single Next.js application and single wildcard domain mapping. Tenant
// authorization remains on the protected routes, never in this proxy.
export function proxy(request: NextRequest) {
  const base = tenantBaseDomain()
  if (!base) return NextResponse.next()
  const host = request.headers.get("host") ?? ""
  const canonical = new URL(process.env.NEXTAUTH_URL!)
  const slug = tenantFromHostname(host, base, canonical.hostname)
  if (!slug) {
    const normalizedHost = host.trim().toLowerCase().replace(/:\d{1,5}$/, "")
    if (normalizedHost !== canonical.hostname &&
        (normalizedHost === base || normalizedHost.endsWith("." + base))) {
      return new Response("Not Found", { status: 404 })
    }
    return NextResponse.next()
  }

  const path = request.nextUrl.pathname
  if (path.startsWith("/_next/") || path.startsWith("/api/") ||
      path === "/favicon.ico" || /\.(?:png|jpg|jpeg|webp|ico|svg|css|js|txt)$/i.test(path)) {
    return NextResponse.next()
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 })
  }
  const route = tenantHostRoute(slug, path)
  if (route.kind === "not-found") return new Response("Not Found", { status: 404 })
  if (route.kind === "next") return NextResponse.next()
  if (route.kind === "platform-redirect") {
    // Keep the NextAuth cookies host-only on the trusted central platform
    // instead of spreading platform-owner sessions to tenant subdomains.
    return NextResponse.redirect(new URL(route.path, canonical.origin), 307)
  }
  return NextResponse.rewrite(new URL(route.path, request.url))
}

export const config = { matcher: "/:path*" }

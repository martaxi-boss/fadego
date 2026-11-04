import { getPublicAvailability } from "@/lib/public-booking"
import { sourceIpFromHeaders } from "@/lib/request-context"
import { readBoundedJsonObject } from "@/lib/http-json"
import { consumeRateLimit, hashRateLimitKey } from "@/lib/rate-limit"

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params
  const sourceIp = sourceIpFromHeaders(request.headers)
  const limit = await consumeRateLimit(
    "publicAvailabilityRead",
    hashRateLimitKey("public-availability", slug, sourceIp),
  )
  if (!limit.allowed) {
    return Response.json({ ok: false, code: "UNAVAILABLE" }, {
      status: 429,
      headers: noStoreHeaders,
    })
  }
  const parsedBody = await readBoundedJsonObject(request)
  if (!parsedBody.ok) {
    return Response.json({ ok: false, code: "INVALID_INPUT" }, {
      status: parsedBody.status,
      headers: noStoreHeaders,
    })
  }
  const body = parsedBody.value
  const result = await getPublicAvailability({
    barbershopSlug: slug,
    serviceId:
      typeof body.serviceId === "string" ? body.serviceId : "",
    requestedStaffMemberId:
      typeof body.requestedStaffMemberId === "string"
        ? body.requestedStaffMemberId
        : undefined,
    localDate:
      typeof body.localDate === "string" ? body.localDate : "",
  })

  return Response.json(result, {
    status: result.ok ? 200 : 400,
    headers: noStoreHeaders,
  })
}

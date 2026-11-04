import { requestBookingRecovery } from "@/lib/booking-recovery"
import { readBoundedJsonObject } from "@/lib/http-json"
import { sourceIpFromHeaders } from "@/lib/request-context"

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params
  const json = await readBoundedJsonObject(request)
  if (!json.ok) {
    return Response.json({ ok: false, code: "INVALID_INPUT" }, {
      status: json.status, headers,
    })
  }
  const data = json.value
  const result = await requestBookingRecovery({
    barbershopSlug: slug,
    email: typeof data.email === "string" ? data.email : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    localDate: typeof data.localDate === "string" ? data.localDate : "",
  }, { sourceIp: sourceIpFromHeaders(request.headers) })

  const status = result.ok ? 200
    : result.code === "RATE_LIMITED" ? 429
      : result.code === "EMAIL_UNAVAILABLE" ? 503 : 400
  return Response.json(result, { status, headers })
}

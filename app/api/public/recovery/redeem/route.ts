import { redeemBookingRecovery } from "@/lib/booking-recovery"
import { readBoundedJsonObject } from "@/lib/http-json"
import { sourceIpFromHeaders } from "@/lib/request-context"

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
}

export async function POST(request: Request) {
  const parsed = await readBoundedJsonObject(request)
  if (!parsed.ok) {
    return Response.json({ ok: false, code: "UNAVAILABLE" }, {
      status: parsed.status, headers,
    })
  }
  const token = parsed.value.token
  const result = await redeemBookingRecovery(
    typeof token === "string" ? token : "",
    { sourceIp: sourceIpFromHeaders(request.headers) },
  )
  return Response.json(result, {
    status: result.ok ? 200 : result.code === "RATE_LIMITED" ? 429 : 400,
    headers,
  })
}

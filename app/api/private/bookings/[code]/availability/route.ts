import { getPrivateRescheduleAvailability } from "@/lib/private-booking-actions"
import { sourceIpFromHeaders } from "@/lib/request-context"
import { readBoundedJsonObject } from "@/lib/http-json"

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params
  const parsedBody = await readBoundedJsonObject(request)
  if (!parsedBody.ok) {
    return Response.json({ ok: false, code: "INVALID_INPUT" }, {
      status: parsedBody.status,
      headers: noStoreHeaders,
    })
  }
  const body = parsedBody.value
  const result = await getPrivateRescheduleAvailability(
    code,
    typeof body.localDate === "string" ? body.localDate : "",
    { sourceIp: sourceIpFromHeaders(request.headers) },
  )

  const status = result.ok
    ? 200
    : result.code === "RATE_LIMITED"
      ? 429
      : result.code === "ACTION_UNAVAILABLE"
        ? 409
        : 400

  return Response.json(result, {
    status,
    headers: noStoreHeaders,
  })
}

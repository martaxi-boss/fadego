import { reschedulePrivateBooking } from "@/lib/private-booking-actions"
import { sourceIpFromHeaders } from "@/lib/request-context"

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params
  const body = await request.json().catch(() => ({}))
  const result = await reschedulePrivateBooking(
    code,
    {
      startsAt:
        typeof body.startsAt === "string" ? body.startsAt : "",
    },
    { sourceIp: sourceIpFromHeaders(request.headers) },
  )

  const status = result.ok
    ? 200
    : result.code === "RATE_LIMITED"
      ? 429
      : result.code === "SLOT_UNAVAILABLE"
        ? 409
        : result.code === "ACTION_UNAVAILABLE"
          ? 409
          : 400

  return Response.json(result, {
    status,
    headers: noStoreHeaders,
  })
}

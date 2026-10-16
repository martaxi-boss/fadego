import { createPublicBooking } from "@/lib/public-booking"
import { sourceIpFromHeaders } from "@/lib/request-context"
import { asJsonObject, readBoundedJsonObject } from "@/lib/http-json"

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params
  const parsedBody = await readBoundedJsonObject(request)
  if (!parsedBody.ok) {
    return Response.json({ ok: false, code: "INVALID_INPUT" }, {
      status: parsedBody.status,
      headers: noStoreHeaders,
    })
  }
  const body = parsedBody.value
  const customer = asJsonObject(body.customer)
  const result = await createPublicBooking(
    {
      barbershopSlug: slug,
      serviceId:
        typeof body.serviceId === "string" ? body.serviceId : "",
      requestedStaffMemberId:
        typeof body.requestedStaffMemberId === "string"
          ? body.requestedStaffMemberId
          : undefined,
      startsAt:
        typeof body.startsAt === "string" ? body.startsAt : "",
      customer: {
        name:
          typeof customer.name === "string"
            ? customer.name
            : "",
        phone:
          typeof customer.phone === "string"
            ? customer.phone
            : "",
        email:
          typeof customer.email === "string"
            ? customer.email
            : "",
      },
    },
    {
      sourceIp: sourceIpFromHeaders(request.headers),
    },
  )

  const status = result.ok
    ? 201
    : result.code === "RATE_LIMITED"
      ? 429
      : result.code === "SLOT_UNAVAILABLE"
        ? 409
        : 400

  return Response.json(result, {
    status,
    headers: noStoreHeaders,
  })
}

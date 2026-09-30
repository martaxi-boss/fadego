import { createPublicBooking } from "@/lib/public-booking"
import { sourceIpFromHeaders } from "@/lib/request-context"

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params
  const body = await request.json().catch(() => ({}))
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
          typeof body.customer?.name === "string"
            ? body.customer.name
            : "",
        phone:
          typeof body.customer?.phone === "string"
            ? body.customer.phone
            : "",
        email:
          typeof body.customer?.email === "string"
            ? body.customer.email
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

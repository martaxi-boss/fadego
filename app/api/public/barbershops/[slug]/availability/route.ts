import { getPublicAvailability } from "@/lib/public-booking"

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params
  const body = await request.json().catch(() => ({}))
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

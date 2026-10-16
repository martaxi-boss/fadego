import { createPublicBooking } from "@/lib/public-booking"
import { sourceIpFromHeaders } from "@/lib/request-context"
import { asJsonObject, readBoundedJsonObject } from "@/lib/http-json"
import { bookingEmailProviderReady, deliverBookingEmail } from "@/lib/booking-email"

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
  // Do not accept an appointment when we cannot even attempt confirmation.
  // The Owner must authorize/configure the mail provider in the VPS vault.
  if (!bookingEmailProviderReady()) {
    return Response.json({ ok: false, code: "EMAIL_UNAVAILABLE" }, {
      status: 503,
      headers: noStoreHeaders,
    })
  }
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

  if (result.ok) {
    // Network I/O happens AFTER the booking/outbox transaction has committed.
    // A failed provider request is durable and will be retried by systemd.
    let emailStatus: "accepted" | "pending" = "pending"
    try {
      emailStatus = await deliverBookingEmail(result.emailNotificationId)
    } catch {
      // Never leak private access, email address or provider error details.
    }
    return Response.json({
      ok: true,
      accessCode: result.accessCode,
      accessPath: result.accessPath,
      emailStatus,
    }, { status: 201, headers: noStoreHeaders })
  }

  const status = result.code === "RATE_LIMITED"
    ? 429
    : result.code === "SLOT_UNAVAILABLE"
      ? 409
      : 400

  return Response.json(result, { status, headers: noStoreHeaders })
}

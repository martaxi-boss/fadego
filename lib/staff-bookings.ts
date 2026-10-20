import { z } from "zod"
import { bookingEmailReadyForTenant, deliverBookingEmail } from "@/lib/booking-email"
import { publicCustomerSchema } from "@/lib/public-booking"
import { issueBookingAccessToken } from "@/lib/booking-access"
import { sealBookingEmail } from "@/lib/booking-email-crypto"
import {
  runBookingMutation, createBookingInTransaction,
  cancelBookingByShop, rescheduleBooking, finalizeBookingByShop,
  type BookingMutationHook,
} from "@/lib/booking-engine"
import type { requireStaffScope } from "@/lib/staff-planning"

type Scope = Awaited<ReturnType<typeof requireStaffScope>>
export class StaffBookingError extends Error {
  constructor(readonly code: "INVALID" | "EMAIL_OFF" | "NOT_OWNED") {
    super("Não foi possível gerir esta marcação.")
  }
}

export const manualStaffBookingSchema = z.object({
  serviceId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  customer: publicCustomerSchema,
})

export const createManualStaffBooking = async (scope: Scope, raw: unknown) => {
  const parsed = manualStaffBookingSchema.safeParse(raw)
  if (!parsed.success) throw new StaffBookingError("INVALID")
  // The business must be able to send access to modify/cancel the booking.
  // This also fails closed for the staging pilot while Gmail sending is disabled.
  if (!(await bookingEmailReadyForTenant(scope.shop.slug))) {
    throw new StaffBookingError("EMAIL_OFF")
  }
  const input = parsed.data
  const result = await runBookingMutation(async (tx) => {
    const shop = await tx.barbershop.findUnique({
      where: { id: scope.shop.id },
      select: {
        id: true, slug: true, name: true, status: true, timezone: true,
        senderAlias: true, contactEmail: true,
      },
    })
    if (!shop || shop.status !== "ACTIVE" || !shop.timezone) {
      throw new StaffBookingError("INVALID")
    }
    const customer = await tx.customer.create({
      data: { barbershopId: shop.id, ...input.customer },
    })
    const booking = await createBookingInTransaction(tx, {
      barbershopId: shop.id,
      customerId: customer.id,
      serviceId: input.serviceId,
      requestedStaffMemberId: scope.staffMember.id,
      startsAt: new Date(input.startsAt),
    })
    const accessCode = await issueBookingAccessToken(tx, {
      barbershopId: shop.id, bookingId: booking.id,
    })
    const sealed = sealBookingEmail({
      email: input.customer.email,
      customerName: input.customer.name,
      barbershopName: shop.name,
      barbershopSlug: shop.slug,
      senderAlias: shop.senderAlias ?? undefined,
      barbershopContactEmail: shop.contactEmail ?? undefined,
      serviceName: booking.serviceNameSnapshot,
      startsAt: booking.startsAt.toISOString(),
      timezone: shop.timezone,
      accessCode,
    })
    const notification = await tx.bookingEmailOutbox.create({
      data: { barbershopId: shop.id, bookingId: booking.id, sealedPayload: sealed },
    })
    return { notificationId: notification.id }
  })
  // Post-commit only: never call Google while holding the booking lock.
  const emailStatus = await deliverBookingEmail(result.notificationId)
  return { emailStatus }
}

// Keep the private access code inside the encrypted notification payload.
// An employee never receives or logs a customer's bearer credential.
const changeNotification = (
  scope: Scope, kind: "RESCHEDULED" | "CANCELLED",
  setNotification: (id: string) => void,
): BookingMutationHook => async (tx, updated, previousStartsAt) => {
  const shop = await tx.barbershop.findUnique({
    where: { id: scope.shop.id },
    select: {
      name: true, slug: true, timezone: true,
      contactEmail: true, senderAlias: true,
    },
  })
  if (!shop?.timezone) throw new StaffBookingError("INVALID")
  // Every changed booking gets a fresh private link that is never shown in
  // the employee dashboard. This also works for older pilot reservations.
  if (!updated.customerEmailSnapshot || !z.email().safeParse(updated.customerEmailSnapshot).success) return
  const accessCode = await issueBookingAccessToken(tx, {
    barbershopId: scope.shop.id, bookingId: updated.id,
  })
  const payload = sealBookingEmail({
    email: updated.customerEmailSnapshot,
    customerName: updated.customerNameSnapshot,
    barbershopName: shop.name,
    barbershopSlug: shop.slug,
    senderAlias: shop.senderAlias ?? undefined,
    barbershopContactEmail: shop.contactEmail ?? undefined,
    serviceName: updated.serviceNameSnapshot,
    startsAt: updated.startsAt.toISOString(),
    timezone: shop.timezone,
    accessCode,
    kind,
    ...(kind === "RESCHEDULED"
      ? { previousStartsAt: previousStartsAt.toISOString() } : {}),
  })
  const notification = await tx.bookingEmailOutbox.create({
    data: {
      barbershopId: scope.shop.id,
      bookingId: updated.id, kind,
      sealedPayload: payload,
    },
  })
  setNotification(notification.id)
}

export const rescheduleStaffBooking = async (
  scope: Scope, bookingId: string, startsAt: Date,
) => {
  const notice: { id: string | null } = { id: null }
  await rescheduleBooking(
    scope.shop.id, bookingId, startsAt, undefined,
    changeNotification(scope, "RESCHEDULED", (id) => { notice.id = id }),
    scope.staffMember.id,
  )
  if (notice.id) await deliverBookingEmail(notice.id)
}

export const cancelStaffBooking = async (scope: Scope, bookingId: string) => {
  const notice: { id: string | null } = { id: null }
  await cancelBookingByShop(
    scope.shop.id, bookingId, scope.staffMember.id,
    changeNotification(scope, "CANCELLED", (id) => { notice.id = id }),
  )
  if (notice.id) await deliverBookingEmail(notice.id)
}

export const finishStaffBooking = (
  scope: Scope, bookingId: string, outcome: "COMPLETED" | "NO_SHOW",
) => finalizeBookingByShop(
  scope.shop.id, bookingId, outcome, undefined, scope.staffMember.id,
)

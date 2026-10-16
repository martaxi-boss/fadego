"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { AuthorizationError } from "@/lib/access-policy"
import { isValidAgendaDate } from "@/lib/admin-agenda"
import { requireBarbershopBySlug } from "@/lib/authorization"
import { BookingEngineError, cancelBookingByShop } from "@/lib/booking-engine"
import { consumeRateLimit, hashRateLimitKey } from "@/lib/rate-limit"
import { resourceIdSchema } from "@/lib/operational-validation"

export async function cancelTenantBookingAction(
  rawSlug: string,
  rawBookingId: string,
  rawDay: string,
) {
  let access
  try {
    access = await requireBarbershopBySlug(rawSlug, ["OWNER", "ADMIN"])
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/admin")
    throw error
  }

  const day = isValidAgendaDate(rawDay) ? rawDay : ""
  const path = "/admin/" + access.barbershop.slug + "/agenda"
  const destination = path + (day ? "?date=" + day + "&" : "?")
  const id = resourceIdSchema.safeParse(rawBookingId)
  if (!id.success) redirect(destination + "notice=invalid")

  const limiter = await consumeRateLimit(
    "privilegedWrite",
    hashRateLimitKey("admin-booking-cancel", access.user.id, access.barbershop.id),
  )
  if (!limiter.allowed) redirect(destination + "notice=rate-limit")

  try {
    await cancelBookingByShop(access.barbershop.id, id.data)
  } catch (error) {
    if (error instanceof BookingEngineError) {
      redirect(destination + "notice=unavailable")
    }
    throw error
  }

  revalidatePath(path)
  redirect(destination + "notice=cancelled")
}

"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { resourceIdSchema } from "@/lib/operational-validation"
import { isValidAgendaDate } from "@/lib/admin-agenda"
import { consumeRateLimit, hashRateLimitKey } from "@/lib/rate-limit"
import {
  requireStaffScope, updateStaffWeeklyHour,
  addStaffScheduleBlock, removeStaffScheduleBlock,
  StaffPlanningError,
} from "@/lib/staff-planning"
import {
  createManualStaffBooking, rescheduleStaffBooking,
  cancelStaffBooking, finishStaffBooking, StaffBookingError,
} from "@/lib/staff-bookings"
import { BookingEngineError } from "@/lib/booking-engine"

const text = (data: FormData, key: string) => {
  const v = data.get(key)
  return typeof v === "string" ? v.trim() : ""
}
const route = (slug: string, professional: string, date: string, notice: string) => {
  const params = new URLSearchParams({ notice })
  if (isValidAgendaDate(date)) params.set("date", date)
  if (resourceIdSchema.safeParse(professional).success) {
    params.set("professional", professional)
  }
  return "/admin/" + slug + "/barbeiro?" + params.toString()
}
const resultNotice = (error: unknown) => {
  if (error instanceof StaffBookingError && error.code === "EMAIL_OFF") return "email"
  if (error instanceof StaffPlanningError && error.code === "HAS_BOOKINGS") return "occupied"
  if (error instanceof StaffPlanningError && error.code === "DUPLICATE") return "occupied"
  if (error instanceof StaffBookingError ||
      error instanceof StaffPlanningError ||
      error instanceof BookingEngineError ||
      error instanceof z.ZodError) return "unavailable"
  throw error
}

const checkRate = async (userId: string, shopId: string) => {
  const result = await consumeRateLimit(
    "privilegedWrite", hashRateLimitKey("barber-workflow", userId, shopId),
  )
  return result.allowed
}
const refresh = (slug: string) => {
  revalidatePath("/admin/" + slug + "/barbeiro")
  revalidatePath("/admin/" + slug + "/agenda")
  revalidatePath("/b/" + slug)
}

export async function createBarberBookingAction(
  slug: string, requestedProfessional: string, day: string, data: FormData,
) {
  const scope = await requireStaffScope(slug, requestedProfessional)
  if (!(await checkRate(scope.userId, scope.shop.id))) {
    redirect(route(slug, requestedProfessional, day, "limit"))
  }
  let notice = "created"
  try {
    const result = await createManualStaffBooking(scope, {
      serviceId: text(data, "serviceId"),
      startsAt: text(data, "startsAt"),
      customer: {
        name: text(data, "customerName"),
        phone: text(data, "customerPhone"),
        email: text(data, "customerEmail"),
      },
    })
    notice = result.emailStatus === "accepted" ? "created" : "queued"
  } catch (error) {
    notice = resultNotice(error)
  }
  refresh(slug)
  redirect(route(slug, requestedProfessional, day, notice))
}

export async function rescheduleBarberBookingAction(
  slug: string, requestedProfessional: string, bookingId: string,
  day: string, data: FormData,
) {
  const scope = await requireStaffScope(slug, requestedProfessional)
  if (!(await checkRate(scope.userId, scope.shop.id))) {
    redirect(route(slug, requestedProfessional, day, "limit"))
  }
  let notice = "rescheduled"
  const parsed = z.string().datetime({ offset: true }).safeParse(text(data, "startsAt"))
  if (!resourceIdSchema.safeParse(bookingId).success || !parsed.success) {
    redirect(route(slug, requestedProfessional, day, "unavailable"))
  }
  try {
    await rescheduleStaffBooking(scope, bookingId, new Date(parsed.data))
  } catch (error) {
    notice = resultNotice(error)
  }
  refresh(slug)
  redirect(route(slug, requestedProfessional, day, notice))
}

export async function cancelBarberBookingAction(
  slug: string, requestedProfessional: string, bookingId: string, day: string,
) {
  const scope = await requireStaffScope(slug, requestedProfessional)
  if (!(await checkRate(scope.userId, scope.shop.id))) {
    redirect(route(slug, requestedProfessional, day, "limit"))
  }
  let notice = "cancelled"
  if (!resourceIdSchema.safeParse(bookingId).success) {
    redirect(route(slug, requestedProfessional, day, "unavailable"))
  }
  try {
    await cancelStaffBooking(scope, bookingId)
  } catch (error) {
    notice = resultNotice(error)
  }
  refresh(slug)
  redirect(route(slug, requestedProfessional, day, notice))
}

export async function finishBarberBookingAction(
  slug: string, requestedProfessional: string,
  bookingId: string, day: string, outcome: "COMPLETED" | "NO_SHOW",
) {
  const scope = await requireStaffScope(slug, requestedProfessional)
  if (!(await checkRate(scope.userId, scope.shop.id))) {
    redirect(route(slug, requestedProfessional, day, "limit"))
  }
  if (!resourceIdSchema.safeParse(bookingId).success ||
      (outcome !== "COMPLETED" && outcome !== "NO_SHOW")) {
    redirect(route(slug, requestedProfessional, day, "unavailable"))
  }
  let notice = "finished"
  try {
    await finishStaffBooking(scope, bookingId, outcome)
  } catch (error) {
    notice = resultNotice(error)
  }
  refresh(slug)
  redirect(route(slug, requestedProfessional, day, notice))
}

export async function setBarberWeeklyHourAction(
  slug: string, requestedProfessional: string, day: string, data: FormData,
) {
  const scope = await requireStaffScope(slug, requestedProfessional)
  if (!(await checkRate(scope.userId, scope.shop.id))) {
    redirect(route(slug, requestedProfessional, day, "limit"))
  }
  const weekday = Number(text(data, "weekday"))
  let notice = "hours"
  try {
    await updateStaffWeeklyHour(scope, {
      weekday,
      defaultHours: text(data, "defaultHours") === "true",
      isClosed: text(data, "isClosed") === "true",
      opensAt: text(data, "opensAt"),
      closesAt: text(data, "closesAt"),
    })
  } catch (error) {
    notice = resultNotice(error)
  }
  refresh(slug)
  redirect(route(slug, requestedProfessional, day, notice))
}

export async function addBarberBlockAction(
  slug: string, requestedProfessional: string, day: string, data: FormData,
) {
  const scope = await requireStaffScope(slug, requestedProfessional)
  if (!(await checkRate(scope.userId, scope.shop.id))) {
    redirect(route(slug, requestedProfessional, day, "limit"))
  }
  let notice = "blocked"
  try {
    await addStaffScheduleBlock(scope, {
      localDate: text(data, "localDate"),
      fullDay: text(data, "fullDay") === "true",
      opensAt: text(data, "opensAt"),
      closesAt: text(data, "closesAt"),
      label: text(data, "label"),
    })
  } catch (error) {
    notice = resultNotice(error)
  }
  refresh(slug)
  redirect(route(slug, requestedProfessional, day, notice))
}

export async function removeBarberBlockAction(
  slug: string, requestedProfessional: string, day: string, blockId: string,
) {
  const scope = await requireStaffScope(slug, requestedProfessional)
  if (!(await checkRate(scope.userId, scope.shop.id))) {
    redirect(route(slug, requestedProfessional, day, "limit"))
  }
  let notice = "unblocked"
  if (!resourceIdSchema.safeParse(blockId).success) {
    redirect(route(slug, requestedProfessional, day, "unavailable"))
  }
  try {
    await removeStaffScheduleBlock(scope, blockId)
  } catch (error) {
    notice = resultNotice(error)
  }
  refresh(slug)
  redirect(route(slug, requestedProfessional, day, notice))
}

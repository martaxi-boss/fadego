"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { AuthorizationError } from "@/lib/access-policy"
import { requireBarbershopBySlug } from "@/lib/authorization"
import {
  ClubMembershipError,
  enrollExistingCustomerMembership,
  enrollNewCustomerMembership,
  recordMembershipUsage,
  transitionMembershipStatus,
} from "@/lib/club-memberships"
import {
  existingCustomerEnrollmentSchema,
  membershipLifecycleTargetSchema,
  membershipCustomerInputSchema,
  membershipUsageInputSchema,
  newCustomerEnrollmentSchema,
} from "@/lib/club-membership-validation"
import { consumeRateLimit, hashRateLimitKey } from "@/lib/rate-limit"

type Notice =
  | "saved"
  | "invalid"
  | "not-found"
  | "rate-limit"
  | "write-failed"
  | "club-plan-unavailable"
  | "club-usage-unavailable"
  | "club-limit"

const clubPath = (slug: string) => `/admin/${slug}/club`

const redirectNotice = (slug: string, notice: Notice): never => {
  redirect(`${clubPath(slug)}?notice=${notice}`)
  throw new Error("Redirect did not terminate the request.")
}

const formText = (formData: FormData, key: string) =>
  String(formData.get(key) ?? "")

const requireWriteAccess = async (rawSlug: string) => {
  let access

  try {
    access = await requireBarbershopBySlug(rawSlug, ["OWNER", "ADMIN"])
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/admin")
    }
    throw error
  }

  const rateLimit = await consumeRateLimit(
    "privilegedWrite",
    hashRateLimitKey(
      "club-memberships",
      access.user.id,
      access.barbershop.id,
    ),
  )

  if (!rateLimit.allowed) {
    redirectNotice(access.barbershop.slug, "rate-limit")
  }

  return access
}

const handleFailure = (
  slug: string,
  operation: string,
  error: unknown,
): never => {
  if (error instanceof ClubMembershipError) {
    if (error.code === "PLAN_UNAVAILABLE") {
      return redirectNotice(slug, "club-plan-unavailable")
    }

    if (error.code === "LIMIT_REACHED") {
      return redirectNotice(slug, "club-limit")
    }

    if (
      error.code === "USAGE_UNAVAILABLE" ||
      error.code === "CYCLE_UNAVAILABLE" ||
      error.code === "ENTITLEMENT_UNAVAILABLE" ||
      error.code === "INVALID_LIFECYCLE"
    ) {
      return redirectNotice(slug, "club-usage-unavailable")
    }

    if (
      error.code === "NOT_FOUND" ||
      error.code === "CUSTOMER_UNAVAILABLE"
    ) {
      return redirectNotice(slug, "not-found")
    }
  }

  console.error(`[club-memberships] ${operation} failed`)
  return redirectNotice(slug, "write-failed")
}

const finish = (slug: string): never => {
  revalidatePath(clubPath(slug))
  revalidatePath(`/admin/${slug}`)
  return redirectNotice(slug, "saved")
}

export async function enrollExistingCustomerAction(
  rawSlug: string,
  formData: FormData,
) {
  const access = await requireWriteAccess(rawSlug)
  const parsed = existingCustomerEnrollmentSchema.safeParse({
    customerId: formText(formData, "customerId"),
    membershipPlanId: formText(formData, "membershipPlanId"),
  })

  if (!parsed.success) {
    return redirectNotice(access.barbershop.slug, "invalid")
  }

  try {
    await enrollExistingCustomerMembership(
      access.barbershop.id,
      parsed.data.customerId,
      parsed.data.membershipPlanId,
    )
  } catch (error) {
    handleFailure(access.barbershop.slug, "enroll-existing", error)
  }

  finish(access.barbershop.slug)
}

export async function enrollNewCustomerAction(
  rawSlug: string,
  formData: FormData,
) {
  const access = await requireWriteAccess(rawSlug)
  const customer = membershipCustomerInputSchema.safeParse({
    name: formText(formData, "name"),
    phone: formText(formData, "phone"),
    email: formText(formData, "email"),
  })
  const parsed = newCustomerEnrollmentSchema.safeParse({
    membershipPlanId: formText(formData, "membershipPlanId"),
    customer: customer.success ? customer.data : null,
  })

  if (!customer.success || !parsed.success) {
    return redirectNotice(access.barbershop.slug, "invalid")
  }

  try {
    await enrollNewCustomerMembership(
      access.barbershop.id,
      parsed.data.membershipPlanId,
      parsed.data.customer,
    )
  } catch (error) {
    handleFailure(access.barbershop.slug, "enroll-new", error)
  }

  finish(access.barbershop.slug)
}

export async function transitionMembershipStatusAction(
  rawSlug: string,
  membershipId: string,
  targetStatus: string,
) {
  const access = await requireWriteAccess(rawSlug)
  const target = membershipLifecycleTargetSchema.safeParse(targetStatus)

  if (!target.success) {
    return redirectNotice(access.barbershop.slug, "invalid")
  }

  try {
    await transitionMembershipStatus(
      access.barbershop.id,
      membershipId,
      target.data,
    )
  } catch (error) {
    handleFailure(access.barbershop.slug, "lifecycle", error)
  }

  finish(access.barbershop.slug)
}

export async function recordMembershipUsageAction(
  rawSlug: string,
  membershipId: string,
  membershipEntitlementId: string,
) {
  const access = await requireWriteAccess(rawSlug)
  const parsed = membershipUsageInputSchema.safeParse({
    membershipId,
    membershipEntitlementId,
  })

  if (!parsed.success) {
    return redirectNotice(access.barbershop.slug, "invalid")
  }

  try {
    await recordMembershipUsage(
      access.barbershop.id,
      parsed.data.membershipId,
      parsed.data.membershipEntitlementId,
    )
  } catch (error) {
    handleFailure(access.barbershop.slug, "usage", error)
  }

  finish(access.barbershop.slug)
}

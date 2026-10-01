"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { AuthorizationError } from "@/lib/access-policy"
import { requireBarbershopBySlug } from "@/lib/authorization"
import {
  archiveMembershipPlan,
  ClubPlanError,
  createMembershipPlan,
  updateMembershipPlan,
} from "@/lib/club-plans"
import { membershipPlanInputSchema } from "@/lib/club-plan-validation"
import { consumeRateLimit, hashRateLimitKey } from "@/lib/rate-limit"

type Notice =
  | "saved"
  | "invalid"
  | "club-assignment"
  | "not-found"
  | "rate-limit"
  | "write-failed"

const clubPath = (slug: string) => `/admin/${slug}/club`

const redirectNotice = (slug: string, notice: Notice): never => {
  redirect(`${clubPath(slug)}?notice=${notice}`)
  throw new Error("Redirect did not terminate the request.")
}

const formText = (formData: FormData, key: string) =>
  String(formData.get(key) ?? "")

const entitlementsFromForm = (formData: FormData) =>
  formData.getAll("serviceId").map((rawServiceId) => {
    const serviceId = String(rawServiceId)
    const unlimited =
      String(formData.get(`unlimited:${serviceId}`) ?? "") === "true"

    return {
      serviceId,
      usageLimitPerCycle: unlimited
        ? null
        : formText(formData, `usageLimit:${serviceId}`),
    }
  })

const parsePlanInput = (formData: FormData) =>
  membershipPlanInputSchema.safeParse({
    name: formText(formData, "name"),
    description: formText(formData, "description"),
    price: formText(formData, "price"),
    benefits: formText(formData, "benefits"),
    active: formText(formData, "active"),
    entitlements: entitlementsFromForm(formData),
  })

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
      "club-plans",
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
  if (error instanceof ClubPlanError) {
    if (error.code === "INVALID_ASSIGNMENT") {
      return redirectNotice(slug, "club-assignment")
    }

    if (error.code === "NOT_FOUND") {
      return redirectNotice(slug, "not-found")
    }

    return redirectNotice(slug, "invalid")
  }

  console.error(`[club-plans] ${operation} failed`)
  return redirectNotice(slug, "write-failed")
}

const finish = (slug: string): never => {
  revalidatePath(clubPath(slug))
  revalidatePath(`/admin/${slug}`)
  return redirectNotice(slug, "saved")
}

export async function createMembershipPlanAction(
  rawSlug: string,
  formData: FormData,
) {
  const access = await requireWriteAccess(rawSlug)
  const parsed = parsePlanInput(formData)

  if (!parsed.success) {
    return redirectNotice(access.barbershop.slug, "invalid")
  }

  try {
    await createMembershipPlan(access.barbershop.id, parsed.data)
  } catch (error) {
    handleFailure(access.barbershop.slug, "create", error)
  }

  finish(access.barbershop.slug)
}

export async function updateMembershipPlanAction(
  rawSlug: string,
  membershipPlanId: string,
  formData: FormData,
) {
  const access = await requireWriteAccess(rawSlug)
  const parsed = parsePlanInput(formData)

  if (!parsed.success) {
    return redirectNotice(access.barbershop.slug, "invalid")
  }

  try {
    await updateMembershipPlan(
      access.barbershop.id,
      membershipPlanId,
      parsed.data,
    )
  } catch (error) {
    handleFailure(access.barbershop.slug, "update", error)
  }

  finish(access.barbershop.slug)
}

export async function archiveMembershipPlanAction(
  rawSlug: string,
  membershipPlanId: string,
) {
  const access = await requireWriteAccess(rawSlug)

  try {
    await archiveMembershipPlan(
      access.barbershop.id,
      membershipPlanId,
    )
  } catch (error) {
    handleFailure(access.barbershop.slug, "archive", error)
  }

  finish(access.barbershop.slug)
}

"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { AuthorizationError } from "@/lib/access-policy"
import { requireBarbershopBySlug } from "@/lib/authorization"
import {
  createChairConfiguration,
  createServiceConfiguration,
  createStaffMember,
  OperationalConfigError,
  saveOpeningHourConfiguration,
  updateChairConfiguration,
  updateServiceConfiguration,
  updateStaffMember,
} from "@/lib/operational-config"
import {
  chairInputSchema,
  openingHourInputSchema,
  resourceIdSchema,
  serviceInputSchema,
  staffCreateInputSchema,
  staffUpdateInputSchema,
} from "@/lib/operational-validation"
import { consumeRateLimit, hashRateLimitKey } from "@/lib/rate-limit"

type Section = "professionals" | "chairs" | "services" | "hours"
type Notice =
  | "saved"
  | "invalid"
  | "assignment"
  | "not-found"
  | "rate-limit"
  | "write-failed"

const sectionPath = (slug: string, section: Section) =>
  `/admin/${slug}/${section}`

const redirectNotice = (
  slug: string,
  section: Section,
  notice: Notice,
): never => redirect(`${sectionPath(slug, section)}?notice=${notice}`)

const formText = (formData: FormData, key: string) =>
  String(formData.get(key) ?? "")

const requireWriteAccess = async (rawSlug: string, section: Section) => {
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
      "operational-config",
      access.user.id,
      access.barbershop.id,
    ),
  )

  if (!rateLimit.allowed) {
    redirectNotice(access.barbershop.slug, section, "rate-limit")
  }

  return access
}

const handleWriteFailure = (
  slug: string,
  section: Section,
  operation: string,
  error: unknown,
): never => {
  if (error instanceof OperationalConfigError) {
    if (error.code === "INVALID_ASSIGNMENT") {
      redirectNotice(slug, section, "assignment")
    }

    if (error.code === "NOT_FOUND") {
      redirectNotice(slug, section, "not-found")
    }

    redirectNotice(slug, section, "invalid")
  }

  console.error(`[operational-config] ${operation} failed`)
  redirectNotice(slug, section, "write-failed")
}

const finishWrite = (slug: string, section: Section): never => {
  revalidatePath(sectionPath(slug, section))
  revalidatePath(`/admin/${slug}`)
  redirectNotice(slug, section, "saved")
}

export async function createStaffMemberAction(
  rawSlug: string,
  formData: FormData,
) {
  const access = await requireWriteAccess(rawSlug, "professionals")
  const input = staffCreateInputSchema.safeParse({
    name: formText(formData, "name"),
    photoUrl: formText(formData, "photoUrl"),
    active: formText(formData, "active"),
  })

  if (!input.success) {
    redirectNotice(access.barbershop.slug, "professionals", "invalid")
  }

  try {
    await createStaffMember(access.barbershop.id, input.data)
  } catch (error) {
    handleWriteFailure(
      access.barbershop.slug,
      "professionals",
      "create-staff",
      error,
    )
  }

  finishWrite(access.barbershop.slug, "professionals")
}

export async function updateStaffMemberAction(
  rawSlug: string,
  staffMemberId: string,
  formData: FormData,
) {
  const access = await requireWriteAccess(rawSlug, "professionals")
  const id = resourceIdSchema.safeParse(staffMemberId)
  const input = staffUpdateInputSchema.safeParse({
    name: formText(formData, "name"),
    photoUrl: formText(formData, "photoUrl"),
    active: formText(formData, "active"),
    archived: formText(formData, "archived"),
  })

  if (!id.success || !input.success) {
    redirectNotice(access.barbershop.slug, "professionals", "invalid")
  }

  try {
    await updateStaffMember(access.barbershop.id, id.data, input.data)
  } catch (error) {
    handleWriteFailure(
      access.barbershop.slug,
      "professionals",
      "update-staff",
      error,
    )
  }

  finishWrite(access.barbershop.slug, "professionals")
}

export async function createChairAction(
  rawSlug: string,
  formData: FormData,
) {
  const access = await requireWriteAccess(rawSlug, "chairs")
  const input = chairInputSchema.safeParse({
    number: formText(formData, "number"),
    name: formText(formData, "name"),
    mode: formText(formData, "mode"),
    staffMemberId: formText(formData, "staffMemberId"),
    active: formText(formData, "active"),
  })

  if (!input.success) {
    redirectNotice(access.barbershop.slug, "chairs", "invalid")
  }

  try {
    await createChairConfiguration(access.barbershop.id, input.data)
  } catch (error) {
    handleWriteFailure(
      access.barbershop.slug,
      "chairs",
      "create-chair",
      error,
    )
  }

  finishWrite(access.barbershop.slug, "chairs")
}

export async function updateChairAction(
  rawSlug: string,
  chairId: string,
  formData: FormData,
) {
  const access = await requireWriteAccess(rawSlug, "chairs")
  const id = resourceIdSchema.safeParse(chairId)
  const input = chairInputSchema.safeParse({
    number: formText(formData, "number"),
    name: formText(formData, "name"),
    mode: formText(formData, "mode"),
    staffMemberId: formText(formData, "staffMemberId"),
    active: formText(formData, "active"),
  })

  if (!id.success || !input.success) {
    redirectNotice(access.barbershop.slug, "chairs", "invalid")
  }

  try {
    await updateChairConfiguration(access.barbershop.id, id.data, input.data)
  } catch (error) {
    handleWriteFailure(
      access.barbershop.slug,
      "chairs",
      "update-chair",
      error,
    )
  }

  finishWrite(access.barbershop.slug, "chairs")
}

export async function createServiceAction(
  rawSlug: string,
  formData: FormData,
) {
  const access = await requireWriteAccess(rawSlug, "services")
  const input = serviceInputSchema.safeParse({
    name: formText(formData, "name"),
    description: formText(formData, "description"),
    price: formText(formData, "price"),
    durationMinutes: formText(formData, "durationMinutes"),
    active: formText(formData, "active"),
  })

  if (!input.success) {
    redirectNotice(access.barbershop.slug, "services", "invalid")
  }

  try {
    await createServiceConfiguration(access.barbershop.id, input.data)
  } catch (error) {
    handleWriteFailure(
      access.barbershop.slug,
      "services",
      "create-service",
      error,
    )
  }

  finishWrite(access.barbershop.slug, "services")
}

export async function updateServiceAction(
  rawSlug: string,
  serviceId: string,
  formData: FormData,
) {
  const access = await requireWriteAccess(rawSlug, "services")
  const id = resourceIdSchema.safeParse(serviceId)
  const input = serviceInputSchema.safeParse({
    name: formText(formData, "name"),
    description: formText(formData, "description"),
    price: formText(formData, "price"),
    durationMinutes: formText(formData, "durationMinutes"),
    active: formText(formData, "active"),
  })

  if (!id.success || !input.success) {
    redirectNotice(access.barbershop.slug, "services", "invalid")
  }

  try {
    await updateServiceConfiguration(access.barbershop.id, id.data, input.data)
  } catch (error) {
    handleWriteFailure(
      access.barbershop.slug,
      "services",
      "update-service",
      error,
    )
  }

  finishWrite(access.barbershop.slug, "services")
}

export async function saveOpeningHourAction(
  rawSlug: string,
  openingHourId: string,
  formData: FormData,
) {
  const access = await requireWriteAccess(rawSlug, "hours")
  const id =
    openingHourId.length === 0
      ? null
      : resourceIdSchema.safeParse(openingHourId)

  const input = openingHourInputSchema.safeParse({
    weekday: formText(formData, "weekday"),
    isClosed: formText(formData, "isClosed"),
    opensAt: formText(formData, "opensAt"),
    closesAt: formText(formData, "closesAt"),
  })

  if ((id !== null && !id.success) || !input.success) {
    redirectNotice(access.barbershop.slug, "hours", "invalid")
  }

  try {
    await saveOpeningHourConfiguration(
      access.barbershop.id,
      id === null ? null : id.data,
      input.data,
    )
  } catch (error) {
    handleWriteFailure(
      access.barbershop.slug,
      "hours",
      "save-opening-hour",
      error,
    )
  }

  finishWrite(access.barbershop.slug, "hours")
}

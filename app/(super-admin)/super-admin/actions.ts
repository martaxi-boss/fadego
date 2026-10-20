"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { AuthorizationError } from "@/lib/access-policy"
import { requireSuperAdmin } from "@/lib/authorization"
import {
  createPlatformShopSchema, editPlatformShopSchema, linkPlatformMemberSchema,
  platformMemberAccessSchema, platformIdSchema, platformShopStatusSchema,
} from "@/lib/platform-account-policy"
import {
  createPlatformShop, editPlatformShop, linkPlatformMember, PlatformAccountError,
  setPlatformMemberAccess, setPlatformShopStatus,
} from "@/lib/platform-account-management"
import { consumeRateLimit, hashRateLimitKey } from "@/lib/rate-limit"

type Notice = "created" | "saved" | "invalid" | "duplicate" | "not-ready"
  | "already-member" | "identity-not-ready" | "last-owner" | "archived"
  | "missing" | "rate-limit" | "failed"

const get = (data: FormData, name: string) => String(data.get(name) ?? "")
const base = "/super-admin/barbearias"
const path = (id: string) => base + "/" + id

function announce(notice: Notice, id?: string): never {
  redirect((id ? path(id) : base) + "?notice=" + notice)
  throw new Error("Redirect must terminate execution.")
}

async function requirePlatformWrite() {
  let actor
  try {
    actor = await requireSuperAdmin()
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/login")
    throw error
  }
  const rate = await consumeRateLimit(
    "privilegedWrite", hashRateLimitKey("platform-account-management", actor.id),
  )
  if (!rate.allowed) announce("rate-limit")
}

function writeFailure(error: unknown, id?: string): never {
  if (error instanceof PlatformAccountError) {
    const mapped: Record<PlatformAccountError["code"], Notice> = {
      NOT_FOUND: "missing",
      ARCHIVED: "archived",
      NOT_READY: "not-ready",
      ALREADY_MEMBER: "already-member",
      IDENTITY_NOT_READY: "identity-not-ready",
      LAST_OWNER: "last-owner",
    }
    announce(mapped[error.code], id)
  }
  if (error && typeof error === "object" && "code" in error &&
      error.code === "P2002") announce("duplicate", id)
  console.error("[platform-account-management] protected mutation failed")
  announce("failed", id)
}

export async function createPlatformShopAction(data: FormData) {
  await requirePlatformWrite()
  const parsed = createPlatformShopSchema.safeParse({
    name: get(data, "name"),
    slug: get(data, "slug"),
    ownerEmail: get(data, "ownerEmail"),
    contactEmail: get(data, "contactEmail"),
  })
  if (!parsed.success) announce("invalid")
  let shop
  try {
    shop = await createPlatformShop(parsed.data)
  } catch (error) {
    writeFailure(error)
  }
  revalidatePath(base)
  revalidatePath("/super-admin")
  announce("created", shop.id)
}

export async function editPlatformShopAction(id: string, data: FormData) {
  await requirePlatformWrite()
  if (!platformIdSchema.safeParse(id).success) announce("invalid")
  const parsed = editPlatformShopSchema.safeParse({
    name: get(data, "name"), contactEmail: get(data, "contactEmail"),
  })
  if (!parsed.success) announce("invalid", id)
  try {
    await editPlatformShop(id, parsed.data)
  } catch (error) {
    writeFailure(error, id)
  }
  revalidatePath(path(id))
  revalidatePath(base)
  announce("saved", id)
}

export async function setPlatformShopStatusAction(id: string, data: FormData) {
  await requirePlatformWrite()
  if (!platformIdSchema.safeParse(id).success) announce("invalid")
  const status = platformShopStatusSchema.safeParse(get(data, "status"))
  if (!status.success) announce("invalid", id)
  try {
    await setPlatformShopStatus(id, status.data)
  } catch (error) {
    writeFailure(error, id)
  }
  revalidatePath(path(id))
  revalidatePath(base)
  revalidatePath("/super-admin")
  announce("saved", id)
}

export async function linkPlatformMemberAction(id: string, data: FormData) {
  await requirePlatformWrite()
  if (!platformIdSchema.safeParse(id).success) announce("invalid")
  const parsed = linkPlatformMemberSchema.safeParse({
    email: get(data, "email"), role: get(data, "role"),
  })
  if (!parsed.success) announce("invalid", id)
  try {
    await linkPlatformMember(id, parsed.data)
  } catch (error) {
    writeFailure(error, id)
  }
  revalidatePath(path(id))
  announce("saved", id)
}

export async function setPlatformMemberAccessAction(
  id: string, membershipId: string, data: FormData,
) {
  await requirePlatformWrite()
  if (!platformIdSchema.safeParse(id).success ||
      !platformIdSchema.safeParse(membershipId).success) announce("invalid")
  const active = platformMemberAccessSchema.safeParse(get(data, "active"))
  if (!active.success) announce("invalid", id)
  try {
    await setPlatformMemberAccess(id, membershipId, active.data)
  } catch (error) {
    writeFailure(error, id)
  }
  revalidatePath(path(id))
  announce("saved", id)
}

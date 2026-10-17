import { z } from "zod"
import { adminEmailSchema, barbershopSlugSchema } from "@/lib/validation"

const contactEmail = z.union([adminEmailSchema, z.literal("")])
  .transform((value) => value || null)

export const createPlatformShopSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: barbershopSlugSchema,
  ownerEmail: adminEmailSchema,
  contactEmail,
})
export const editPlatformShopSchema = z.object({
  name: z.string().trim().min(2).max(120),
  contactEmail,
})
export const platformIdSchema = z.string().uuid()
export const platformShopStatusSchema = z.enum(["ACTIVE", "SUSPENDED"])
export const platformMemberRoleSchema = z.enum(["OWNER", "ADMIN", "STAFF"])
export const platformMemberAccessSchema = z.enum(["true", "false"])
  .transform((value) => value === "true")
export const linkPlatformMemberSchema = z.object({
  email: adminEmailSchema,
  role: platformMemberRoleSchema,
})
export type CreatePlatformShopInput = z.infer<typeof createPlatformShopSchema>
export type EditPlatformShopInput = z.infer<typeof editPlatformShopSchema>
export type LinkPlatformMemberInput = z.infer<typeof linkPlatformMemberSchema>

// Prevent opening an unowned or unconfigured shop to real reservations.
export const canActivatePlatformShop = (
  ownerCount: number, chairCount: number, serviceCount: number, openDayCount: number,
) => ownerCount > 0 && chairCount > 0 && serviceCount > 0 && openDayCount > 0

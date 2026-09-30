import { z } from "zod"

export const normalizeAdminEmail = (value: string) =>
  value.trim().toLowerCase()

export const adminEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254)

export const credentialsSchema = z.object({
  email: adminEmailSchema,
  password: z.string().min(1).max(512),
})

export const barbershopSlugSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const normalizeBarbershopSlug = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)

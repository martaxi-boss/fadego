import { z } from "zod"

export const bootstrapAdminConfigSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(256),
  name: z.string().trim().min(1).max(120),
})

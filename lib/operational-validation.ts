import { z } from "zod"

const booleanTextSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")

const nullableTextSchema = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => (value.length === 0 ? null : value))

const optionalHttpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (value.length === 0) return true

    try {
      const url = new URL(value)
      return url.protocol === "http:" || url.protocol === "https:"
    } catch {
      return false
    }
  }, "URL inválido.")
  .transform((value) => (value.length === 0 ? null : value))

const nullableUuidSchema = z
  .union([z.literal(""), z.string().uuid()])
  .transform((value) => (value.length === 0 ? null : value))

const priceSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(",", "."))
  .refine(
    (value) => /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value),
    "Preço inválido.",
  )

const clockSchema = z
  .string()
  .trim()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)

const clockToMinutes = (value: string) => {
  const parsed = clockSchema.safeParse(value)
  if (!parsed.success) return null

  const [hours, minutes] = parsed.data.split(":").map(Number)
  return hours * 60 + minutes
}

export const resourceIdSchema = z.string().uuid()

export const staffCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  photoUrl: optionalHttpUrlSchema,
  active: booleanTextSchema,
})

export const staffUpdateInputSchema = staffCreateInputSchema.extend({
  archived: booleanTextSchema,
})

export const chairInputSchema = z
  .object({
    number: z.coerce.number().int().min(1).max(5),
    name: nullableTextSchema(80),
    mode: z.enum(["WALK_IN", "GENERAL_BOOKING", "STAFF_BOOKING"]),
    staffMemberId: nullableUuidSchema,
    active: booleanTextSchema,
  })
  .superRefine((value, context) => {
    if (value.mode === "STAFF_BOOKING" && !value.staffMemberId) {
      context.addIssue({
        code: "custom",
        path: ["staffMemberId"],
        message: "STAFF_BOOKING exige um profissional.",
      })
    }

    if (value.mode !== "STAFF_BOOKING" && value.staffMemberId) {
      context.addIssue({
        code: "custom",
        path: ["staffMemberId"],
        message: "Este modo não aceita profissional.",
      })
    }
  })

export const serviceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: nullableTextSchema(1000),
  price: priceSchema,
  durationMinutes: z.coerce
    .number()
    .int()
    .positive()
    .refine((value) => value % 15 === 0, "A duração deve respeitar a grelha de 15 minutos."),
  active: booleanTextSchema,
})

export const openingHourInputSchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    isClosed: booleanTextSchema,
    opensAt: z.string().trim(),
    closesAt: z.string().trim(),
  })
  .superRefine((value, context) => {
    if (value.isClosed) return

    const opensAt = clockToMinutes(value.opensAt)
    const closesAt = clockToMinutes(value.closesAt)

    if (opensAt === null) {
      context.addIssue({
        code: "custom",
        path: ["opensAt"],
        message: "Hora de abertura inválida.",
      })
    }

    if (closesAt === null) {
      context.addIssue({
        code: "custom",
        path: ["closesAt"],
        message: "Hora de fecho inválida.",
      })
    }

    if (opensAt !== null && closesAt !== null && opensAt >= closesAt) {
      context.addIssue({
        code: "custom",
        path: ["closesAt"],
        message: "A abertura tem de ser anterior ao fecho.",
      })
    }
  })
  .transform((value) => ({
    weekday: value.weekday,
    isClosed: value.isClosed,
    opensAt: value.isClosed ? null : clockToMinutes(value.opensAt),
    closesAt: value.isClosed ? null : clockToMinutes(value.closesAt),
  }))

export type StaffCreateInput = z.infer<typeof staffCreateInputSchema>
export type StaffUpdateInput = z.infer<typeof staffUpdateInputSchema>
export type ChairInput = z.infer<typeof chairInputSchema>
export type ServiceInput = z.infer<typeof serviceInputSchema>
export type OpeningHourInput = z.infer<typeof openingHourInputSchema>

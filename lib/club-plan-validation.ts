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

const planPriceSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(",", "."))
  .refine(
    (value) => /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value),
    "Preço inválido.",
  )

const usageLimitSchema = z.preprocess(
  (value) =>
    value === null || value === undefined || value === ""
      ? null
      : value,
  z.coerce.number().int().min(1).max(9999).nullable(),
)

export const membershipPlanEntitlementSchema = z.object({
  serviceId: z.string().uuid(),
  usageLimitPerCycle: usageLimitSchema,
})

export const membershipPlanInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: nullableTextSchema(2000),
    price: planPriceSchema,
    benefits: nullableTextSchema(4000),
    active: booleanTextSchema,
    entitlements: z.array(membershipPlanEntitlementSchema).max(100),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>()
    for (const entitlement of value.entitlements) {
      if (seen.has(entitlement.serviceId)) {
        context.addIssue({
          code: "custom",
          path: ["entitlements"],
          message: "O mesmo serviço não pode aparecer duas vezes no plano.",
        })
        return
      }
      seen.add(entitlement.serviceId)
    }
  })

export type MembershipPlanInput = z.infer<typeof membershipPlanInputSchema>
export type MembershipPlanEntitlementInput = z.infer<
  typeof membershipPlanEntitlementSchema
>

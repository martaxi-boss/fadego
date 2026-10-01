import { z } from "zod"

const optionalEmailSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0
      ? undefined
      : value,
  z.string().trim().toLowerCase().email().max(254).optional(),
)

export const membershipCustomerInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .min(6)
    .max(32)
    .regex(/^\+?[0-9](?:[0-9\s().-]{4,30})[0-9]$/),
  email: optionalEmailSchema,
})

export const existingCustomerEnrollmentSchema = z.object({
  customerId: z.string().uuid(),
  membershipPlanId: z.string().uuid(),
})

export const newCustomerEnrollmentSchema = z.object({
  membershipPlanId: z.string().uuid(),
  customer: membershipCustomerInputSchema,
})

export const membershipLifecycleTargetSchema = z.enum([
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
])

export const membershipUsageInputSchema = z.object({
  membershipId: z.string().uuid(),
  membershipEntitlementId: z.string().uuid(),
})

export type MembershipCustomerInput = z.infer<
  typeof membershipCustomerInputSchema
>
export type ExistingCustomerEnrollmentInput = z.infer<
  typeof existingCustomerEnrollmentSchema
>
export type NewCustomerEnrollmentInput = z.infer<
  typeof newCustomerEnrollmentSchema
>
export type MembershipLifecycleTarget = z.infer<
  typeof membershipLifecycleTargetSchema
>

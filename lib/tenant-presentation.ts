import type { TenantRole } from "@prisma/client"

// Operational staff can see the member and booking context they need, but
// telephone numbers and email addresses stay restricted to tenant managers.
export const canViewCustomerContactDetails = (role: TenantRole) =>
  role === "OWNER" || role === "ADMIN"

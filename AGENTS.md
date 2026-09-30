# FADEGO Repository Governance

## Control chain

OWNER -> CONSULTOR -> SUPERVISOR -> BUILDER.

The Builder implements only bounded Supervisor orders. The Builder does not merge, deploy, release, or expand scope without explicit authority.

## Product invariants

- One FADEGO platform serves multiple barbershops (tenants).
- Operational data must always be isolated by barbershop.
- End customers must not require a `User` account to use customer-facing booking flows.
- The MVP supports at most 5 chairs per barbershop.
- Chairs will later support `WALK_IN`, `GENERAL_BOOKING`, and `STAFF_BOOKING`.
- Configuration changes must not destroy operational history.
- FADEGO staff must not be required to operate each barbershop day to day.
- A future `StaffMember` is an operational entity and must not be synonymous with `User`; its future `userId` relationship is optional.

## Change control

- Preserve tenant isolation at both application and database design levels.
- Never trust a client-supplied user id, tenant slug, or resource id as authorization by itself.
- Do not commit secrets or real customer/admin credentials.
- No merge, deployment, release, DNS, or production-infrastructure changes without explicit Supervisor authority.

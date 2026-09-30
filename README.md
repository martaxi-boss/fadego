# FADEGO

FADEGO is a multi-tenant web/PWA for autonomous barbershop operations.

The current implementation contains the accepted Phase-1 foundation plus the operational configuration layer for tenant-scoped professionals, chairs, services, and weekly opening hours. Booking, customers, capacity/overlap logic, memberships, payments, DNS, deployment, and production infrastructure remain intentionally outside this gate.

## Stack

- Next.js 16 / React 19 / TypeScript
- Tailwind CSS 4
- PostgreSQL
- Prisma 7
- NextAuth 4 credentials authentication
- Zod validation
- `rate-limiter-flexible` with PostgreSQL persistence

## Local setup

1. Install Node.js 22 and pnpm 10.
2. Copy `.env.example` to `.env.local` and replace every placeholder.
3. Start a local PostgreSQL instance. `docker compose up -d postgres` is provided as an optional local helper.
4. Run `pnpm install --frozen-lockfile`.
5. Run `pnpm prisma migrate deploy`.
6. Run `pnpm dev`.

No public self-registration exists. Administrative users must be provisioned through an authorized administrative/bootstrap process outside this gate; passwords stored in `User.passwordHash` must use the supplied scrypt format.

Operational configuration writes are restricted to active tenant OWNER/ADMIN memberships. STAFF may read the tenant configuration but cannot mutate professionals, chairs, services, or opening hours.

## Validation

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm prisma validate`, migration deployment/status, and `pnpm secret:scan` are exercised by CI against PostgreSQL.

See `THIRD_PARTY_NOTICES.md` and `docs/REUSE_SOURCES.md` for provenance.

# FADEGO

FADEGO is a multi-tenant barbershop operations platform. This repository is the
canonical Next.js application; it is not a native Floot project.

## Current implemented scope

- Independent barbershop (tenant) management with OWNER/ADMIN/STAFF roles.
- Professionals, up to five chairs, services, opening hours and operational settings.
- Transaction-safe booking engine, availability and overlap prevention.
- Public reservation flow without a customer account; private confirmation,
  cancellation and rescheduling through hashed access codes.
- Tenant-scoped administrator agenda and searchable customer list.
- Club plans, enrollments, entitlements and usage recording.
- Provider-neutral ledger for Club payments and platform SaaS subscriptions.
  **No real processor, checkout, billing webhook or financial effect is wired in.**
- Read-only super-admin platform metrics.

## Technical stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, Prisma 7,
PostgreSQL 16, NextAuth 4 and Zod. Node.js 22 and pnpm 10.

## Development

1. Copy `.env.example` to `.env.local` and replace the placeholders.
2. Run `docker compose up -d postgres` for a local database.
3. Run `pnpm install --frozen-lockfile`.
4. Run `pnpm prisma migrate deploy`.
5. Run `pnpm dev`.

There is intentionally no public administrator self-registration. For a fresh,
empty installation only, provision the first SUPER_ADMIN using
`pnpm bootstrap:admin` with `FADEGO_BOOTSTRAP_EMAIL`,
`FADEGO_BOOTSTRAP_PASSWORD` and optional `FADEGO_BOOTSTRAP_NAME` supplied via
an approved secret manager (never commit credentials). The bootstrap refuses
to run when any user already exists. Existing installations require a separate
authorized recovery procedure.

## Trusted reverse proxy and booking limits

`FADEGO_TRUST_PROXY_HOPS` defaults to `0` (fail-closed). The application
ignores untrusted client IP headers in that mode. Configure the exact number
(1–5) of trusted append-only forwarding proxies in the final hosting ingress.
**Do not guess this value** or enable it unless the entry proxy strips/extends
inbound client-controlled `X-Forwarded-For`. Until configured, shared
tenant-scoped source limits may restrict legitimate public bookings.

Public booking creation uses separate source, phone and combined budgets.
Booking links are private bearer credentials; avoid logging or public sharing.

## Validation and release

CI runs migrations, tests, typecheck, lint, production build and secret scan
against PostgreSQL. Commands: `pnpm test`, `pnpm typecheck`,
`pnpm lint`, `pnpm build`, `pnpm secret:scan`.

Current repository is **not a completed production rollout**. Read
`docs/PRODUCTION_READINESS.md` before connecting payment providers,
DNS, real customer data or production hosting.

Provenance: `THIRD_PARTY_NOTICES.md` and `docs/REUSE_SOURCES.md`.

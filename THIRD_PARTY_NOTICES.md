# Third-Party Notices

This file records code or substantial adapted material incorporated into FADEGO.

## BarberLab

- Repository: `LuanPaD/BarberLab`
- Source commit: `29a907cb234501f8769db6ed4c92b1047f9b9747`
- License: Apache License 2.0
- Original files/components used or adapted:
  - `package.json` and `pnpm-lock.yaml` — dependency baseline and reproducible lock
  - `prisma.config.ts` — Prisma 7 configuration/environment-loading pattern
  - `app/_lib/prisma.ts` — PostgreSQL/Prisma adapter connection pattern
  - `app/_lib/rate-limit.ts` — PostgreSQL-backed `rate-limiter-flexible` pattern
  - `app/(admin)/layout.tsx` — administrative shell/layout concept
  - `app/globals.css`, `tsconfig.json`, `eslint.config.mjs`, and `postcss.config.mjs` — generic application/configuration patterns
- FADEGO destinations:
  - `package.json`, `pnpm-lock.yaml`
  - `prisma.config.ts`, `lib/prisma.ts`, `lib/rate-limit.ts`
  - `app/_components/admin-shell.tsx`, `app/globals.css`
  - `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`
- Material modifications:
  - Removed BarberLab domain roles, customer-login assumptions, demo authorization, Google-only access, booking schemas, booking capacity rules, slot assumptions, business branding/content, and operational modules.
  - Replaced tenant ownership on `User` with `BarbershopMember`.
  - Replaced authentication with NextAuth 4 Credentials using secure password hashes and JWT identity; tenant authorization always re-checks the database.
  - Rate-limit keys are hashed and unexpected storage failures deny the protected operation rather than weakening the gate.
  - Admin UI was rewritten for neutral FADEGO branding and tenant context.

The required Apache 2.0 license text is preserved at `third_party/licenses/BarberLab-Apache-2.0.txt`.

At the audited source pin no separate BarberLab `NOTICE` file was present.

## Reference-only repositories

The other repositories listed in `docs/REUSE_SOURCES.md` were consulted as architectural references only. No code or substantial adapted material from them is represented as incorporated by this task.

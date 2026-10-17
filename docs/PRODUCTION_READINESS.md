# FADEGO — Production readiness and Human Gates

Last reviewed: 2026-10-17. Source of truth: `martaxi-boss/fadego`.
This is a development readiness plan, **not proof of an active deployment**.

## Code-deliverable work without owner intervention

- [x] Tenant-scoped booking engine, transactional conflict prevention
- [x] Customer-facing reservation, cancellation and rescheduling
- [x] Club plan and membership domain, payment ledger foundation
- [x] Tenant-scoped administrative agenda with protected cancellation
- [x] Tenant-scoped searchable customer directory
- [x] Read-only super-admin metrics
- [x] Anti-abuse hardening: explicit proxy trust, phone/source budgets
- [x] Expiry enforcement for private access codes 30 days after appointment end
- [x] Client actions prohibited after original appointment start
- [x] CI runs on main/builder pushes, on all pull requests and manually; obsolete PR runs are cancelled
- [x] Protected booking completion and no-show actions (only after appointment end)
- [x] Protected reassignments through existing transactional booking engine
- [x] Customer directory restricted to OWNER/ADMIN
- [x] CI browser rehearsal with synthetic barbershop workflow: OWNER reassign/cancel/complete/no-show; STAFF read-only agenda with contacts masked, cross-tenant denied
- [ ] Per-professional STAFF agenda restriction (requires an approved link between login identity and operational StaffMember)
- [x] Basic browser accessibility smoke: Portuguese document language, visible form-control names, image alt attributes on booking/login/recovery/OWNER/STAFF views (not a full WCAG audit)
- [ ] Full API/dependency audit, performance, WCAG accessibility audit and load/stress certification
- [x] Public booking requires customer email; encrypted confirmation outbox with automatic retries (code/CI)
- [ ] Provider-approved real email sender, domain verification, live delivery proof, and opt-out policies for other notifications
- [x] Encrypted email events for customer cancellations and reschedules with same-transaction outbox and idempotent retries (code/CI)
- [x] Expiring one-use customer booking-access recovery by verified email, phone and local date (code/CI)
- [ ] More optional operational/marketing notifications, sender consent and approved policies
- [x] One-time guarded SUPER_ADMIN bootstrap tool for a fresh database
- [ ] Password recovery and approved provisioning/recovery for existing installations
- [x] Ephemeral CI Postgres backup/restore rehearsal with synthetic tenant/customer data
- [ ] Production backups/restores, observability, incident runbook and RGPD
      retention/export/erasure design
- [x] CI production HTTP smoke: homepage, login, unauthenticated admin guard and invalid private access
- [x] Multi-tenant end-to-end browser isolation for OWNER, STAFF and anonymous booking pages
- [ ] Pilot acceptance with real authorized barbershops (Human Gate)

## Human Gate — only external choices or access

1. **Hosting and DNS**: production provider, domain ownership and chosen
   barbershop URL format (wildcard subdomain versus path routing).
2. **Reverse proxy**: confirm actual trusted proxy-hop topology and secure
   forwarding configuration before setting FADEGO_TRUST_PROXY_HOPS > 0.
3. **Payment processor**: merchant/platform accounts, live credentials,
   legal onboarding, payment terms, refunds and financial approvals.
4. **Messaging**: choose/approve SMS, email, WhatsApp senders and usage costs.
5. **Real data and legal**: controller/processor terms, privacy policy,
   retention schedule and first pilot barbershop authorization.
6. **Commercial go-live**: final permission to publish and collect live
   payments or accept real customer bookings.

Do not open a Human Gate merely for internal refactors, tests, documentation
or reversible corrections. Never fabricate infrastructure state or claim a
deployment exists without verifying it.

## Operational prerequisites

- Enforce main-branch protections and required `CI / validate` checks via
  GitHub repository rulesets (administrative action; connector may not expose
  the necessary endpoint).
- Validate that all migrations apply to a clean production-like database.
- Maintain encrypted backups and **prove a restore** with retained audit data.
- Store credentials only in the approved production secret manager.
- Verify HTTPS, cookie settings, outbound communication consent and monitoring.
- Ensure publicly accessible pages are not indexed prematurely: root metadata
  currently sets `robots: noindex` pending launch approval.
- Confirm administrative bootstrap/recovery and robust customer data isolation.

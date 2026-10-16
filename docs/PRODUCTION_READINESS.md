# FADEGO — Production readiness and Human Gates

Last reviewed: 2026-10-16. Source of truth: `martaxi-boss/fadego`.
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
- [x] CI includes all development branches and main on push
- [x] Protected booking completion and no-show actions (only after appointment end)
- [x] Protected reassignments through existing transactional booking engine
- [x] Customer directory restricted to OWNER/ADMIN
- [ ] Advanced staff-restricted agenda and real barbershop workflow tests
- [ ] API audit, dependency audit, performance, accessibility and stress tests
- [ ] Operational notifications with opt-out and retry policies
- [ ] Password recovery and secure initial administrative provisioning
- [ ] Controlled backups/restores, observability, incident runbook and RGPD
      retention/export/erasure design
- [ ] Automated multi-tenant end-to-end browser testing and pilot acceptance

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

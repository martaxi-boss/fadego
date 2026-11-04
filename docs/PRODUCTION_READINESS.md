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
- [x] Gmail-only owner/admin panel, per-tenant send-only OAuth and optional Reply-To; legacy verified-domain sender alias kept internally (not offered in pilot); CI-only, no real send
- [ ] Validate real Google OAuth vault and HTTPS staging; obtain Owner consent, Supervisor approval and a single permitted delivery test; define opt-out rules only for non-transactional notifications
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
4. **Messaging**: Gmail is the only approved integration direction for partner barbershops; approve Google OAuth publication/verification and explicit test sends before commercial use. SMS/WhatsApp remain out of scope.
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

- [x] Gmail OAuth send-only pilot integration coded: per-tenant one-time state and PKCE, encrypted refresh token, confirmed Google identity and separate explicit send gate (code/CI only; no real consent/send)

## Gmail exclusivo e email de resposta da barbearia

Para aceitar reservas reais, a barbearia liga **o seu próprio Gmail**
pela Google (OAuth com `gmail.send`, sem leitura da caixa de correio).
O Gmail pessoal de suporte do FADEGO não é um remetente partilhado
pelos parceiros. O cliente final indica apenas o seu **email obrigatório**
para receber confirmação e links privados; não faz autorização Google.

O campo `Barbershop.contactEmail` no painel serve somente para
`Reply-To` facultativo: se não for preenchido, a resposta segue
naturalmente para o Gmail de envio. Guardar este campo não altera
a conta ligada nem liga outros provedores.

O código conserva `senderAlias` e o adaptador para um eventual remetente
verificado sob o domínio FADEGO, mas **ambos estão fora da oferta atual**:
o campo alias está oculto no painel e as alterações de contacto preservam
o valor já guardado. Não criar caixas pagas por subdomínio, não
integrar Outlook/SMTP e não falsificar o endereço de envio.

O OAuth por barbearia é isolado por tenant, mantém token encriptado
e tem duas portas de ativação independentes: autorização da Google
e aceitação explícita de envio pelo titular, além da ativação
global aprovada. Configurar a Google não significa que já exista
consentimento OAuth no FADEGO, entrega real ou publicação na VPS.

## Gmail test sender — only after individual Google consent and staging approval

- The Gmail OAuth web server flow uses `openid email https://www.googleapis.com/auth/gmail.send`, a per-tenant, one-use database-backed state, PKCE S256, ten-minute expiry, FADEGO active user/membership verification, and Google-verified email/sub identity. No Gmail password or inbox-reading scope is requested. Google's `gmail.send` is **sensitive**, requiring an appropriate verification/review before offering it publicly.
- Dedicated `GMAIL_TOKEN_ENCRYPTION_SECRET` stays only in the approved VPS secret vault; encrypted verifier and refresh-token values are stored separately with purpose-specific HKDF keys and AES-256-GCM. The new SQL migration does not change existing bookings. The Google OAuth client ID and secret are also vault-only.
- Callback `https://fadego.duckdns.org/api/integrations/gmail/callback` was configured by the Owner in Google Cloud for the test application, but has **not** been exercised in a real redirect. HTTPS/staging, OAuth callback and account-consent validity still require live proof; do not infer that the DuckDNS hostname is presently reachable.
- A connected Gmail is **disabled for sending by default**. Enabling needs `BOOKING_EMAIL_PROVIDER=gmail`, `GMAIL_LIVE_SEND_ENABLED=true` (explicit approved deployment change) and a separate OWNER/ADMIN checkbox/action on the barbershop's Email page. Each new public booking checks the *individual tenant* Gmail status before accepting the booking.
- When a send is allowed, the Gmail `From` is **exactly** the verified Google account mailbox. The historical FADEGO branded-alias code is retained but non-Gmail runtime sending is disabled; Gmail cannot masquerade as `alias+slug@...` or another address. Replies can still use a different configured tenant mailbox.
- The Gmail API has **no idempotency key** for `messages.send`. To avoid sending two copies containing the same private code, the worker records `GMAIL_SEND_ATTEMPTED` before dispatch. A crash/ambiguous response leads to `GMAIL_UNCERTAIN` and **no automatic resend**. The user must inspect Gmail Sent manually; actual delivery is not certified until the approved pilot. A provider refusal can be retried.
- Only synthetic customer records may be used without external authority. A real Gmail test needs: Google Cloud OAuth consent configuration (testing audience includes owner Google address), selected owner’s Google consent, explicit Supervisor-approved isolated HTTPS staging and vault setup, a deliberate FADEGO send activation, and a separately authorized test booking to an address the owner controls. An OAuth app still in Testing can have refresh tokens expiring after seven days; do not declare production readiness.
- The entire code change deliberately stops **before merge, deployment, DNS, API credentials, OAuth consent and actual message dispatch**.

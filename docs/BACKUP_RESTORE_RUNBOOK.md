# FADEGO — Database backup and restore rehearsal

This file describes a **development/CI drill**, not an operational backup or a
verified production restore. No live data or production credentials are used.

## Already automated

The GitHub `CI` job runs `scripts/ci-backup-restore.sh` after the schema
migrations, automated tests, typecheck, build, and secret scan. It:

1. Uses the existing disposable Postgres 16 CI service container.
2. Seeds a synthetic `Barbershop` and `Customer` linked by the production
   tenant foreign-key structure.
3. Creates a PostgreSQL custom-format archive (`pg_dump -Fc`).
4. Restores that archive into a **separate**, newly created database in
   the same disposable CI service.
5. Verifies the related synthetic records and Prisma migration ledger.
6. Deletes the temporary restored database and archive; GitHub disposes of
   the CI service after the workflow.

The script deliberately requires `CI=true` and the current job's Docker
service container ID. It must **never** be copied and pointed at real data.

## What production still needs (Human Gate for infrastructure)

The platform owner must approve the hosting/provider, data controller terms,
retention schedule, recovery objectives (RPO/RTO), and approved secret vault.
Only after those decisions should an infrastructure-specific implementation:

- perform automated encrypted backups at a defined frequency, stored offsite
  with narrowly restricted access and tested retention/expiry;
- include point-in-time recovery (WAL/PITR) when the required RPO needs it;
- avoid logging private booking URLs/codes or personal data in telemetry;
- monitor job failures, backup freshness, storage quotas and restore alerts;
- test a separate, isolated **production-like** restore and record timestamps,
  data-integrity results and approval without exposing customer data;
- document an incident operator's recovery steps and approval chain.

A passing CI drill proves only that the database schema and test fixtures
round-trip with matching PostgreSQL tools. It does **not** prove production
backups exist, that they are encrypted, or that a production restore will pass.

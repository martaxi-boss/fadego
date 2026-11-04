#!/usr/bin/env bash
set -euo pipefail

# Safety: this drill is deliberately restricted to a fresh GitHub Actions
# PostgreSQL service container. Never point it at production or staging data.
if [[ "$(printenv CI || true)" != "true" ]]; then
  echo "Refusing restore drill outside CI." >&2
  exit 1
fi
container_id="$(printenv CI_POSTGRES_CONTAINER_ID || true)"
if [[ ! "$container_id" =~ ^[[:xdigit:]]{12,64}$ ]]; then
  echo "Missing or invalid GitHub Actions Postgres container ID." >&2
  exit 1
fi

source_db="fadego"
restore_db="fadego_restore_ci"
archive="$(mktemp)"
cleanup() {
  docker exec "$container_id" dropdb -U fadego --if-exists "$restore_db" >/dev/null 2>&1 || true
  rm -f "$archive"
}
trap cleanup EXIT

# Synthetic records are only inserted into the disposable CI source database.
# Use real tables and their composite tenant FK, not an unrelated probe table.
docker exec -i "$container_id" psql -U fadego -d "$source_db" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "Barbershop"
  ("id", "name", "slug", "timezone", "createdAt", "updatedAt")
VALUES
  ('11111111-1111-4111-8111-111111111111',
   'CI Restore Rehearsal', 'ci-restore-rehearsal', 'Europe/Lisbon', now(), now());

INSERT INTO "Customer"
  ("id", "barbershopId", "name", "phone", "createdAt", "updatedAt")
VALUES
  ('22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111',
   'Synthetic Backup Customer', '+351 910 000 000', now(), now());
SQL

# pg_dump/pg_restore run in the Postgres:16 container, avoiding tool-version
# mismatches between the service and the Ubuntu runner.
docker exec "$container_id" pg_dump -U fadego -d "$source_db" \
  --format=custom --no-owner --no-acl > "$archive"
if [[ ! -s "$archive" ]]; then
  echo "Backup archive is empty." >&2
  exit 1
fi

docker exec "$container_id" createdb -U fadego -T template0 "$restore_db"
docker exec -i "$container_id" pg_restore -U fadego -d "$restore_db" \
  --exit-on-error --no-owner --no-acl < "$archive"

# Verify restored tenant data, the FK relationship and the migration ledger.
restored_data="$(
  docker exec "$container_id" psql -U fadego -d "$restore_db" -At \
    -v ON_ERROR_STOP=1 -c \
    "SELECT count(*) FROM \"Customer\" c JOIN \"Barbershop\" b
       ON b.\"id\" = c.\"barbershopId\"
       WHERE b.\"slug\" = 'ci-restore-rehearsal'
       AND c.\"name\" = 'Synthetic Backup Customer';"
)"
if [[ "$restored_data" != "1" ]]; then
  echo "Restored tenant/customer relationship mismatch." >&2
  exit 1
fi

migration_sql='SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'
source_migrations="$(
  docker exec "$container_id" psql -U fadego -d "$source_db" -At -v ON_ERROR_STOP=1 -c "$migration_sql"
)"
restored_migrations="$(
  docker exec "$container_id" psql -U fadego -d "$restore_db" -At -v ON_ERROR_STOP=1 -c "$migration_sql"
)"
if [[ "$source_migrations" -lt 1 || "$source_migrations" != "$restored_migrations" ]]; then
  echo "Prisma migration history differs after restore." >&2
  exit 1
fi

echo "FADEGO CI backup/restore PASS: tenant FK and $restored_migrations migrations retained."

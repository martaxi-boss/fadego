#!/usr/bin/env bash
# Prepare exact reviewed FADEGO staging release. No global or privileged edits.
set -euo pipefail
umask 027

if [[ "$(id -un)" != "fadego-staging" ]]; then
  echo "STAGING_REFUSED_WRONG_ACCOUNT" >&2
  exit 2
fi
if [[ "${FADEGO_STAGING_SUPERVISOR_APPROVED:-}" != "1" ]]; then
  echo "STAGING_REFUSED_SUPERVISOR_GATE" >&2
  exit 2
fi

sha="${FADEGO_STAGING_APPROVED_SHA:-}"
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "STAGING_REFUSED_INVALID_APPROVED_SHA" >&2
  exit 2
fi

node <<'CHECK_ENV'
const assert = require("node:assert/strict")
const db = new URL(process.env.DATABASE_URL ?? "")
assert.equal(db.protocol, "postgresql:")
assert.equal(db.hostname, "127.0.0.1")
assert.equal(db.port || "5432", "5432")
assert.equal(db.username, "fadego_staging")
assert.equal(db.pathname, "/fadego_staging")
assert.equal(process.env.NEXTAUTH_URL, "https://fadego.duckdns.org")
assert.ok((process.env.NEXTAUTH_SECRET ?? "").length >= 32)
assert.equal(process.env.FADEGO_TRUST_PROXY_HOPS, "0")
CHECK_ENV

root="/srv/fadego-staging"
release="$root/releases/$sha"
test -d "$root/releases" || { echo "STAGING_REFUSED_MISSING_RELEASES_DIRECTORY" >&2; exit 2; }
test -w "$root/releases" || { echo "STAGING_REFUSED_RELEASES_NOT_WRITABLE" >&2; exit 2; }
if [[ -e "$release" ]]; then
  echo "STAGING_REFUSED_RELEASE_ALREADY_EXISTS" >&2
  exit 2
fi
command -v node >/dev/null
command -v corepack >/dev/null
command -v git >/dev/null

git clone -q --filter=blob:none --single-branch \
  --branch integration/20261016-fadego-candidate \
  https://github.com/martaxi-boss/fadego.git "$release"
git -C "$release" checkout -q --detach "$sha"
actual="$(git -C "$release" rev-parse HEAD)"
if [[ "$actual" != "$sha" ]]; then
  echo "STAGING_REFUSED_GIT_COMMIT_MISMATCH" >&2
  exit 2
fi

cd "$release"
corepack pnpm install --frozen-lockfile
corepack pnpm build
mkdir -p .next/cache

# The database URL is verified above; NEVER migrate another database.
corepack pnpm prisma migrate deploy

ln -s "$release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
printf 'FADEGO_STAGING_RELEASE_PREPARED=%s\n' "$sha"
echo "SERVICE_NOT_RESTARTED_AND_NGINX_NOT_CHANGED"

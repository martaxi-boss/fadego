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
// Initial pilot must never enable a sender before isolated HTTPS + owner consent.
assert.equal(process.env.BOOKING_EMAIL_PROVIDER, "disabled", "STAGING_REFUSED_LIVE_EMAIL_PROVIDER")
assert.equal(process.env.GMAIL_LIVE_SEND_ENABLED, "false", "STAGING_REFUSED_LIVE_GMAIL_SEND")
CHECK_ENV

root="/srv/fadego-staging"
release="$root/releases/$sha"
test -d "$root/releases" || { echo "STAGING_REFUSED_MISSING_RELEASES_DIRECTORY" >&2; exit 2; }
test -w "$root/releases" || { echo "STAGING_REFUSED_RELEASES_NOT_WRITABLE" >&2; exit 2; }
if [[ -L "$root" || -L "$root/releases" ]]; then
  echo "STAGING_REFUSED_SYMLINK_IN_RELEASE_ROOT" >&2
  exit 2
fi
if [[ -e "$root/current" && ! -L "$root/current" ]]; then
  echo "STAGING_REFUSED_NON_SYMLINK_CURRENT" >&2
  exit 2
fi
if [[ -L "$root/current" ]]; then
  current_target="$(readlink -f "$root/current" || true)"
  if [[ "$current_target" != "$root/releases/"* ]]; then
    echo "STAGING_REFUSED_CURRENT_OUTSIDE_OWN_RELEASES" >&2
    exit 2
  fi
fi
if [[ -e "$root/current.next" || -L "$root/current.next" ]]; then
  echo "STAGING_REFUSED_PENDING_CURRENT_SYMLINK" >&2
  exit 2
fi
if [[ -e "$release" || -L "$release" ]]; then
  echo "STAGING_REFUSED_RELEASE_ALREADY_EXISTS" >&2
  exit 2
fi

# On failure remove only THIS invocation's incomplete, immutable-SHA
# release. Never remove the old live release, current symlink or database.
# This cleanup also allows a safe retry after a build/migration failure.
release_owned=1
pending_link_owned=0
cleanup_partial_release() {
  local result=$?
  trap - EXIT
  if [[ "$result" != 0 && "$release_owned" == 1 ]]; then
    if [[ "$pending_link_owned" == 1 && -L "$root/current.next" ]]; then
      rm -f -- "$root/current.next"
    fi
    if [[ "$release" == "$root/releases/$sha" && -d "$release" && ! -L "$release" ]]; then
      rm -rf -- "$release"
      echo "STAGING_PARTIAL_RELEASE_CLEANED" >&2
    fi
  fi
  exit "$result"
}
trap cleanup_partial_release EXIT

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
corepack pnpm install --frozen-lockfile --prod=false
corepack pnpm build
mkdir -p .next/cache

# The database URL is verified above; NEVER migrate another database.
corepack pnpm prisma migrate deploy

ln -s "$release" "$root/current.next"
pending_link_owned=1
mv -Tf "$root/current.next" "$root/current"
release_owned=0
pending_link_owned=0
printf 'FADEGO_STAGING_RELEASE_PREPARED=%s\n' "$sha"
echo "SERVICE_NOT_RESTARTED_AND_NGINX_NOT_CHANGED"

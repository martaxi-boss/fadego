import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const service = readFileSync("deploy/staging/native/fadego-staging.service", "utf8")
const http = readFileSync("deploy/staging/native/nginx-acme.conf", "utf8")
const https = readFileSync("deploy/staging/native/nginx-https.conf", "utf8")
const config = readFileSync("deploy/staging/native/runtime.env.example", "utf8")
const guide = readFileSync("docs/STAGING_DUCKDNS.md", "utf8")

test("developer sample is Gmail-only and keeps all real sends disabled", () => {
  const sample = readFileSync(".env.example", "utf8")
  assert.match(sample, /^BOOKING_EMAIL_PROVIDER=disabled$/m)
  assert.match(sample, /^GMAIL_LIVE_SEND_ENABLED=false$/m)
  assert.match(sample, /^GOOGLE_GMAIL_CLIENT_ID=$/m)
  assert.doesNotMatch(sample, /^BOOKING_EMAIL_(FROM|API_KEY)=/m)
})

test("native staging runs unprivileged and on localhost only", () => {
  assert.match(service, /User=fadego-staging/)
  assert.match(service, /Group=fadego-staging/)
  assert.match(service, /EnvironmentFile=\/etc\/fadego-staging\/app\.env/)
  assert.match(service, /--hostname 127\.0\.0\.1 --port 3100/)
  assert.match(service, /NoNewPrivileges=yes/)
  assert.match(service, /ProtectSystem=strict/)
  assert.doesNotMatch(service, /ExecStart=.*docker/)
})
test("existing nginx can serve ACME without replacing other hostnames", () => {
  assert.match(http, /server_name fadego\.duckdns\.org/)
  assert.match(http, /listen 80;/)
  assert.match(http, /location \^~ \/.well-known\/acme-challenge\//)
  assert.doesNotMatch(http, /default_server/)
  assert.match(https, /listen 443 ssl;/)
  assert.match(https, /server_name fadego\.duckdns\.org/)
  assert.doesNotMatch(https, /default_server/)
  assert.match(https, /ssl_certificate .*fadego\.duckdns\.org\/fullchain\.pem/)
})
test("staging HTTPS uses a credential gate, noindex and sanitizes proxy forwarding", () => {
  assert.match(https, /auth_basic_user_file \/etc\/nginx\/fadego-staging\.htpasswd/)
  assert.match(https, /X-Robots-Tag "noindex, nofollow, noarchive"/)
  assert.match(https, /proxy_pass http:\/\/127\.0\.0\.1:3100/)
  assert.match(https, /proxy_set_header X-Forwarded-For \$remote_addr/)
  assert.match(https, /proxy_set_header Authorization ""/)
  assert.match(config, /NEXTAUTH_URL=https:\/\/fadego\.duckdns\.org/)
  assert.match(config, /fadego_staging.*fadego_staging/)
  assert.match(config, /FADEGO_TRUST_PROXY_HOPS=0/)
  assert.match(config, /BOOKING_EMAIL_PROVIDER=disabled/)
  assert.match(config, /GMAIL_LIVE_SEND_ENABLED=false/)
  assert.doesNotMatch(config, /BOOKING_EMAIL_(FROM|API_KEY)=/)
  assert.doesNotMatch(config, /GOOGLE_GMAIL_CLIENT_(ID|SECRET)=/)
  assert.doesNotMatch(config, /GMAIL_TOKEN_ENCRYPTION_SECRET=/)
})
test("native release builder remains strictly staging-only and unprivileged", () => {
  const script = readFileSync("deploy/staging/native/build-release.sh", "utf8")
  assert.match(script, /FADEGO_STAGING_APPROVED_SHA/)
  assert.match(script, /FADEGO_STAGING_SUPERVISOR_APPROVED/)
  assert.match(script, /assert\.equal\(process\.env\.BOOKING_EMAIL_PROVIDER, "disabled"/)
  assert.match(script, /assert\.equal\(process\.env\.GMAIL_LIVE_SEND_ENABLED, "false"/)
  assert.match(script, /id -un/)
  assert.match(script, /fadego_staging/)
  assert.match(script, /corepack pnpm install --frozen-lockfile --prod=false/)
  assert.match(script, /corepack pnpm prisma migrate deploy/)
  assert.match(script, /--branch integration\/20261016-fadego-candidate/)
  assert.doesNotMatch(script, /\bsudo\b|\bsystemctl\b|\bdocker\b/)
})

test("a failed native build cleans only its own incomplete release", () => {
  const script = readFileSync("deploy/staging/native/build-release.sh", "utf8")
  assert.match(script, /release_owned=1/)
  assert.match(script, /trap cleanup_partial_release EXIT/)
  assert.match(script, /STAGING_PARTIAL_RELEASE_CLEANED/)
  assert.match(script, /STAGING_REFUSED_CURRENT_OUTSIDE_OWN_RELEASES/)
  assert.match(script, /STAGING_REFUSED_PENDING_CURRENT_SYMLINK/)
  assert.match(script, /release_owned=0/)
  assert.match(script, /mv -Tf "\$root\/current\.next" "\$root\/current"/)
  assert.doesNotMatch(script, /rm -rf -- "\$root\/current"/)
})

test("the external HTTPS test fails closed for an exposed or unidentified site", () => {
  const script = readFileSync("scripts/smoke-staging.mjs", "utf8")
  assert.match(script, /closedGate\.status, 401/)
  assert.match(script, /www-authenticate/)
  assert.match(script, /x-robots-tag/)
  assert.match(script, /rejected\.status, 401/)
  assert.match(script, /loginTarget\.pathname, "\/login"/)
  assert.match(script, /process\.env\.STAGING_GATE_PASSWORD/)
  assert.match(script, /redirect: "manual"/)
})

test("native deployment requires prior approval and must not install Docker", () => {
  assert.match(guide, /sem autoridade do\s+Supervisor/)
  assert.match(guide, /NÃO instalar o gateway Caddy/)
  assert.match(guide, /sem tocar nos restantes projetos/)
})

test("systemd loads the root-only existing Gmail vault after staging configuration", () => {
  const mailService = readFileSync("deploy/staging/native/fadego-booking-email.service", "utf8")
  const regularFile = "EnvironmentFile=/etc/fadego-staging/app.env"
  const protectedGmailVault = "EnvironmentFile=-/root/project-secrets/fadego-gmail/oauth.env"
  for (const unit of [service, mailService]) {
    assert.ok(unit.includes(regularFile), "Retain staging-specific application credentials")
    assert.ok(unit.includes(protectedGmailVault), "Read existing OAuth credentials without copying")
    assert.ok(unit.indexOf(regularFile) < unit.indexOf(protectedGmailVault),
      "Fail-closed vault send gates must override staging defaults")
    assert.match(unit, /User=fadego-staging/)
    assert.match(unit, /ProtectHome=yes/)
    assert.doesNotMatch(unit, /Environment=GOOGLE_GMAIL_CLIENT_(ID|SECRET)/)
  }
})

test("mail retries have their own restricted staging systemd unit", () => {
  const service = readFileSync("deploy/staging/native/fadego-booking-email.service", "utf8")
  const timer = readFileSync("deploy/staging/native/fadego-booking-email.timer", "utf8")
  assert.match(service, /User=fadego-staging/)
  assert.match(service, /EnvironmentFile=\/etc\/fadego-staging\/app.env/)
  assert.match(service, /scripts\/process-booking-emails.ts/)
  assert.match(timer, /OnUnitInactiveSec=5min/)
  assert.match(timer, /Unit=fadego-booking-email.service/)
  assert.doesNotMatch(service, /ExecStart=.*(sudo|docker)/)
})

test("private bearer URLs are excluded from staging Nginx access logs", () => {
  assert.match(https, /location ~ \^\/\(r\|recuperar\|api\/private\/bookings\|api\/public\/recovery\)\//)
  assert.match(https, /access_log off;/)
  assert.match(https, /proxy_set_header Authorization "";/)
})

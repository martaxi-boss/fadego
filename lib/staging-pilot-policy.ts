// Reject all non-FADEGO staging environments before opening a database connection.
// This is not an install/deploy approval: Supervisor authorization is still required.
export function assertStagingPilotEnvironment(
  env: Record<string, string | undefined>, workingDirectory: string,
) {
  if (env.FADEGO_STAGING_SUPERVISOR_APPROVED !== "1" ||
      env.FADEGO_STAGING_PILOT_SEED_APPROVED !== "1" ||
      env.CI === "true") {
    throw new Error("PILOT_SEED_REFUSED_NO_STAGING_APPROVAL")
  }
  if (env.BOOKING_EMAIL_PROVIDER !== "disabled" ||
      env.GMAIL_LIVE_SEND_ENABLED !== "false") {
    throw new Error("PILOT_SEED_REFUSED_REAL_EMAIL")
  }
  if (env.NEXTAUTH_URL !== "https://fadego.duckdns.org") {
    throw new Error("PILOT_SEED_REFUSED_TARGET_ORIGIN")
  }
  if (!workingDirectory.startsWith("/srv/fadego-staging/releases/")) {
    throw new Error("PILOT_SEED_REFUSED_RELEASE_PATH")
  }
  let url: URL
  try {
    url = new URL(env.DATABASE_URL ?? "")
  } catch {
    throw new Error("PILOT_SEED_REFUSED_DATABASE")
  }
  if (url.protocol !== "postgresql:" ||
      url.hostname !== "127.0.0.1" ||
      (url.port || "5432") !== "5432" ||
      url.username !== "fadego_staging" ||
      url.pathname !== "/fadego_staging") {
    throw new Error("PILOT_SEED_REFUSED_DATABASE")
  }
}

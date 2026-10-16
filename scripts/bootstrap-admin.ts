import { db, getPool } from "../lib/prisma"
import { hashPassword } from "../lib/password"
import { bootstrapAdminConfigSchema } from "../lib/bootstrap-policy"

const run = async () => {
  const config = bootstrapAdminConfigSchema.safeParse({
    email: process.env.FADEGO_BOOTSTRAP_EMAIL,
    password: process.env.FADEGO_BOOTSTRAP_PASSWORD,
    name: process.env.FADEGO_BOOTSTRAP_NAME ?? "Administrador FADEGO",
  })
  if (!config.success) {
    throw new Error(
      "Supply a valid FADEGO_BOOTSTRAP_EMAIL, FADEGO_BOOTSTRAP_PASSWORD (12+ chars) and optional FADEGO_BOOTSTRAP_NAME via your secret manager.",
    )
  }

  const passwordHash = await hashPassword(config.data.password)
  const identity = await db.$transaction(async (tx) => {
    // Serialize initial provisioning across simultaneous bootstrap attempts.
    await tx.$queryRaw<{ locked: number }[]>`
      SELECT 1::int AS "locked"
      FROM pg_advisory_xact_lock(7600123456123::bigint)
    `
    const count = await tx.user.count()
    if (count !== 0) {
      throw new Error("Bootstrap refused: users already exist. Use the authorized account recovery process.")
    }

    return tx.user.create({
      data: {
        email: config.data.email,
        name: config.data.name,
        passwordHash,
        platformRole: "SUPER_ADMIN",
        active: true,
      },
      select: { id: true, email: true },
    })
  })

  // Never log the credential or its derived password hash.
  console.log("Initial SUPER_ADMIN created:", identity.id, identity.email)
}

run()
  .catch((error: unknown) => {
    console.error(
      "[bootstrap] Failed:",
      error instanceof Error ? error.message : "Unknown error",
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
    await getPool().end()
  })

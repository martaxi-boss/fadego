// Isolated command for the optional approved systemd timer.
// Does not print recipient addresses, private links or authorization tokens.
import { db, getPool } from "../lib/prisma"
import { processPendingBookingEmails } from "../lib/booking-email"

async function main() {
  const result = await processPendingBookingEmails()
  if (!result.ready) {
    console.error("FADEGO_BOOKING_EMAIL_PROVIDER_NOT_CONFIGURED")
    process.exitCode = 2
    return
  }
  console.log(
    "FADEGO_BOOKING_EMAIL_BATCH accepted=" + result.accepted +
    " pending=" + result.pending,
  )
}

main()
  .catch(() => {
    console.error("FADEGO_BOOKING_EMAIL_BATCH_FAILED")
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
    await getPool().end()
  })

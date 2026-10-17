-- Temporary, one-use recovery links. Only a SHA-256 token hash is stored.
ALTER TABLE "BookingEmailOutbox"
  ADD COLUMN "recoveryTokenHash" VARCHAR(64),
  ADD COLUMN "recoveryExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "recoveryRedeemedAt" TIMESTAMPTZ(3),
  ADD COLUMN "discardedAt" TIMESTAMPTZ(3);
CREATE UNIQUE INDEX "BookingEmailOutbox_recoveryTokenHash_key"
  ON "BookingEmailOutbox"("recoveryTokenHash");

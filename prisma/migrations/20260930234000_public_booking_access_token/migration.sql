-- Public Booking 004A
-- Adds private booking access identities. Raw access codes are never persisted.

CREATE TABLE "BookingAccessToken" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "BookingAccessToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BookingAccessToken_token_hash_check"
        CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "BookingAccessToken_revocation_time_check"
        CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
);

CREATE UNIQUE INDEX "BookingAccessToken_tokenHash_key"
ON "BookingAccessToken"("tokenHash");

CREATE UNIQUE INDEX "BookingAccessToken_id_barbershopId_key"
ON "BookingAccessToken"("id", "barbershopId");

CREATE INDEX "BookingAccessToken_barbershopId_bookingId_idx"
ON "BookingAccessToken"("barbershopId", "bookingId");

CREATE INDEX "BookingAccessToken_revokedAt_idx"
ON "BookingAccessToken"("revokedAt");

-- Future revocation/rotation can preserve old rows while ensuring at most one
-- currently active private access identity per Booking.
CREATE UNIQUE INDEX "BookingAccessToken_one_active_per_booking_key"
ON "BookingAccessToken"("barbershopId", "bookingId")
WHERE "revokedAt" IS NULL;

ALTER TABLE "BookingAccessToken"
ADD CONSTRAINT "BookingAccessToken_barbershopId_fkey"
FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BookingAccessToken"
ADD CONSTRAINT "BookingAccessToken_bookingId_barbershopId_fkey"
FOREIGN KEY ("bookingId", "barbershopId")
REFERENCES "Booking"("id", "barbershopId")
ON DELETE RESTRICT ON UPDATE CASCADE;

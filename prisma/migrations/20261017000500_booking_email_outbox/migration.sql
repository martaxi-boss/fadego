-- One durable, encrypted booking confirmation per booking. No alteration of
-- existing customers, bookings, passwords, or access-token hashes.
CREATE TABLE "BookingEmailOutbox" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "sealedPayload" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMPTZ(3),
    "acceptedAt" TIMESTAMPTZ(3),
    "lastErrorCode" VARCHAR(32),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingEmailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingEmailOutbox_bookingId_barbershopId_key" ON "BookingEmailOutbox"("bookingId", "barbershopId");
CREATE INDEX "BookingEmailOutbox_barbershopId_bookingId_idx" ON "BookingEmailOutbox"("barbershopId", "bookingId");
CREATE INDEX "BookingEmailOutbox_acceptedAt_nextAttemptAt_idx" ON "BookingEmailOutbox"("acceptedAt", "nextAttemptAt");
CREATE INDEX "BookingEmailOutbox_leaseUntil_idx" ON "BookingEmailOutbox"("leaseUntil");

ALTER TABLE "BookingEmailOutbox"
ADD CONSTRAINT "BookingEmailOutbox_bookingId_barbershopId_fkey"
FOREIGN KEY ("bookingId", "barbershopId") REFERENCES "Booking"("id", "barbershopId")
ON DELETE RESTRICT ON UPDATE CASCADE;

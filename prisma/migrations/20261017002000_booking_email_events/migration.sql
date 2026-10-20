-- Existing confirmation notifications remain unchanged. Subsequent actions
-- create independent email jobs for the same booking with separate idempotency.
ALTER TABLE "BookingEmailOutbox"
    ADD COLUMN "kind" VARCHAR(20) NOT NULL DEFAULT 'CONFIRMATION';

DROP INDEX "BookingEmailOutbox_bookingId_barbershopId_key";

-- A booking may have many notifications. The existing tenant-scoped FK and
-- "barbershopId,bookingId" index remain in force.

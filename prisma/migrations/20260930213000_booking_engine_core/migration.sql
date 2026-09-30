-- Booking Engine Core 003A
-- Adds tenant-owned customers, booking snapshots and PostgreSQL conflict guards.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Explicit IANA timezone configuration for booking/opening-hour interpretation.
ALTER TABLE "Barbershop"
ADD COLUMN "timezone" VARCHAR(255);

CREATE TYPE "BookingStatus" AS ENUM (
    'CONFIRMED',
    'COMPLETED',
    'CANCELLED_BY_CUSTOMER',
    'CANCELLED_BY_SHOP',
    'NO_SHOW',
    'NEEDS_REASSIGNMENT'
);

CREATE TYPE "BookingMode" AS ENUM (
    'GENERAL_BOOKING',
    'STAFF_BOOKING'
);

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "chairId" TEXT NOT NULL,
    "staffMemberId" TEXT,
    "mode" "BookingMode" NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "serviceNameSnapshot" TEXT NOT NULL,
    "serviceDurationMinutes" INTEGER NOT NULL,
    "servicePriceSnapshot" DECIMAL(10,2) NOT NULL,
    "customerNameSnapshot" TEXT NOT NULL,
    "customerPhoneSnapshot" TEXT NOT NULL,
    "customerEmailSnapshot" TEXT,
    "staffNameSnapshot" TEXT,
    "chairNumberSnapshot" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Booking_interval_positive_check"
        CHECK ("endsAt" > "startsAt"),
    CONSTRAINT "Booking_duration_grid_check"
        CHECK ("serviceDurationMinutes" > 0 AND "serviceDurationMinutes" % 15 = 0),
    CONSTRAINT "Booking_duration_matches_interval_check"
        CHECK (
            "endsAt" =
            "startsAt" + ("serviceDurationMinutes" * INTERVAL '1 minute')
        ),
    CONSTRAINT "Booking_start_grid_check"
        CHECK (MOD(EXTRACT(EPOCH FROM "startsAt"), 900) = 0),
    CONSTRAINT "Booking_mode_staff_check"
        CHECK (
            ("mode" = 'GENERAL_BOOKING' AND "staffMemberId" IS NULL AND "staffNameSnapshot" IS NULL)
            OR
            ("mode" = 'STAFF_BOOKING' AND "staffMemberId" IS NOT NULL AND "staffNameSnapshot" IS NOT NULL)
        ),
    CONSTRAINT "Booking_price_snapshot_nonnegative_check"
        CHECK ("servicePriceSnapshot" >= 0),
    CONSTRAINT "Booking_chair_number_snapshot_check"
        CHECK ("chairNumberSnapshot" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "Customer_id_barbershopId_key"
ON "Customer"("id", "barbershopId");

CREATE INDEX "Customer_barbershopId_phone_idx"
ON "Customer"("barbershopId", "phone");

CREATE INDEX "Customer_barbershopId_email_idx"
ON "Customer"("barbershopId", "email");

CREATE UNIQUE INDEX "Booking_id_barbershopId_key"
ON "Booking"("id", "barbershopId");

CREATE INDEX "Booking_barbershopId_status_startsAt_idx"
ON "Booking"("barbershopId", "status", "startsAt");

CREATE INDEX "Booking_chairId_startsAt_endsAt_idx"
ON "Booking"("chairId", "startsAt", "endsAt");

CREATE INDEX "Booking_staffMemberId_startsAt_endsAt_idx"
ON "Booking"("staffMemberId", "startsAt", "endsAt");

CREATE INDEX "Booking_customerId_startsAt_idx"
ON "Booking"("customerId", "startsAt");

ALTER TABLE "Customer"
ADD CONSTRAINT "Customer_barbershopId_fkey"
FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_barbershopId_fkey"
FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_customerId_barbershopId_fkey"
FOREIGN KEY ("customerId", "barbershopId")
REFERENCES "Customer"("id", "barbershopId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_serviceId_barbershopId_fkey"
FOREIGN KEY ("serviceId", "barbershopId")
REFERENCES "Service"("id", "barbershopId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_chairId_barbershopId_fkey"
FOREIGN KEY ("chairId", "barbershopId")
REFERENCES "Chair"("id", "barbershopId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_staffMemberId_barbershopId_fkey"
FOREIGN KEY ("staffMemberId", "barbershopId")
REFERENCES "StaffMember"("id", "barbershopId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Half-open [startsAt, endsAt) exclusion constraints.
-- Cancelled/completed/no-show bookings do not consume future capacity.
ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_chair_active_overlap_excl"
EXCLUDE USING gist (
    "chairId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
)
WHERE ("status" IN ('CONFIRMED', 'NEEDS_REASSIGNMENT'));

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_staff_active_overlap_excl"
EXCLUDE USING gist (
    "staffMemberId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
)
WHERE (
    "staffMemberId" IS NOT NULL
    AND "status" IN ('CONFIRMED', 'NEEDS_REASSIGNMENT')
);

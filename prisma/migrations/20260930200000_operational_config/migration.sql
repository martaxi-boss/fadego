-- CreateEnum
CREATE TYPE "ChairMode" AS ENUM ('WALK_IN', 'GENERAL_BOOKING', 'STAFF_BOOKING');

-- Normalize administrative email identity at the database boundary.
ALTER TABLE "User"
ADD CONSTRAINT "User_email_normalized_check"
CHECK ("email" = lower(btrim("email")));

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "photoUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffMember_archived_inactive_check"
        CHECK ("archivedAt" IS NULL OR "active" = false)
);

-- CreateTable
CREATE TABLE "Chair" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "mode" "ChairMode" NOT NULL,
    "staffMemberId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chair_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Chair_number_mvp_check"
        CHECK ("number" BETWEEN 1 AND 5),
    CONSTRAINT "Chair_mode_staff_check"
        CHECK (
            ("mode" = 'STAFF_BOOKING' AND "staffMemberId" IS NOT NULL)
            OR
            ("mode" IN ('WALK_IN', 'GENERAL_BOOKING') AND "staffMemberId" IS NULL)
        )
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Service_price_nonnegative_check"
        CHECK ("price" >= 0),
    CONSTRAINT "Service_duration_grid_check"
        CHECK ("durationMinutes" > 0 AND "durationMinutes" % 15 = 0)
);

-- CreateTable
CREATE TABLE "OpeningHour" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "opensAt" INTEGER,
    "closesAt" INTEGER,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpeningHour_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OpeningHour_weekday_check"
        CHECK ("weekday" BETWEEN 0 AND 6),
    CONSTRAINT "OpeningHour_interval_check"
        CHECK (
            ("isClosed" = true AND "opensAt" IS NULL AND "closesAt" IS NULL)
            OR
            (
                "isClosed" = false
                AND "opensAt" IS NOT NULL
                AND "closesAt" IS NOT NULL
                AND "opensAt" >= 0
                AND "opensAt" < "closesAt"
                AND "closesAt" <= 1439
            )
        )
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_id_barbershopId_key"
ON "StaffMember"("id", "barbershopId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_barbershopId_userId_key"
ON "StaffMember"("barbershopId", "userId");

-- CreateIndex
CREATE INDEX "StaffMember_barbershopId_active_archivedAt_idx"
ON "StaffMember"("barbershopId", "active", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Chair_barbershopId_number_key"
ON "Chair"("barbershopId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Chair_id_barbershopId_key"
ON "Chair"("id", "barbershopId");

-- CreateIndex
CREATE INDEX "Chair_barbershopId_active_mode_idx"
ON "Chair"("barbershopId", "active", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "Service_id_barbershopId_key"
ON "Service"("id", "barbershopId");

-- CreateIndex
CREATE INDEX "Service_barbershopId_active_idx"
ON "Service"("barbershopId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningHour_barbershopId_weekday_key"
ON "OpeningHour"("barbershopId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningHour_id_barbershopId_key"
ON "OpeningHour"("id", "barbershopId");

-- CreateIndex
CREATE INDEX "OpeningHour_barbershopId_idx"
ON "OpeningHour"("barbershopId");

-- AddForeignKey
ALTER TABLE "StaffMember"
ADD CONSTRAINT "StaffMember_barbershopId_fkey"
FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember"
ADD CONSTRAINT "StaffMember_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chair"
ADD CONSTRAINT "Chair_barbershopId_fkey"
FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant-aware composite foreign key: a chair cannot reference staff from another shop.
ALTER TABLE "Chair"
ADD CONSTRAINT "Chair_staffMemberId_barbershopId_fkey"
FOREIGN KEY ("staffMemberId", "barbershopId")
REFERENCES "StaffMember"("id", "barbershopId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service"
ADD CONSTRAINT "Service_barbershopId_fkey"
FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningHour"
ADD CONSTRAINT "OpeningHour_barbershopId_fkey"
FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

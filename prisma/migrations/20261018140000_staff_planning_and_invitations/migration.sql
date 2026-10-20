-- FADEGO: isolated staff schedules, local absences and one-time invitations.
-- This migration is additive; no users, passwords, bookings or secrets are changed.
CREATE TABLE "StaffWeeklyHour" (
  "id" TEXT NOT NULL,
  "barbershopId" TEXT NOT NULL,
  "staffMemberId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL,
  "isClosed" BOOLEAN NOT NULL DEFAULT false,
  "opensAt" INTEGER,
  "closesAt" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffWeeklyHour_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffWeeklyHour_day_check" CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "StaffWeeklyHour_minutes_check" CHECK (
    ("isClosed" = true AND "opensAt" IS NULL AND "closesAt" IS NULL)
    OR ("isClosed" = false AND "opensAt" >= 0 AND "closesAt" <= 1440
        AND "opensAt" < "closesAt" AND "opensAt" % 15 = 0 AND "closesAt" % 15 = 0)
  )
);
CREATE UNIQUE INDEX "StaffWeeklyHour_barbershopId_staffMemberId_weekday_key"
 ON "StaffWeeklyHour"("barbershopId","staffMemberId","weekday");
CREATE INDEX "StaffWeeklyHour_barbershopId_staffMemberId_idx"
 ON "StaffWeeklyHour"("barbershopId","staffMemberId");
ALTER TABLE "StaffWeeklyHour" ADD CONSTRAINT "StaffWeeklyHour_barbershopId_fkey"
 FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffWeeklyHour" ADD CONSTRAINT "StaffWeeklyHour_staffMemberId_barbershopId_fkey"
 FOREIGN KEY ("staffMemberId","barbershopId") REFERENCES "StaffMember"("id","barbershopId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StaffScheduleBlock" (
  "id" TEXT NOT NULL,
  "barbershopId" TEXT NOT NULL,
  "staffMemberId" TEXT NOT NULL,
  "localDate" VARCHAR(10) NOT NULL,
  "startsMinute" INTEGER NOT NULL,
  "endsMinute" INTEGER NOT NULL,
  "label" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffScheduleBlock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffScheduleBlock_minutes_check" CHECK (
    "startsMinute" >= 0 AND "endsMinute" <= 1440 AND
    "startsMinute" < "endsMinute" AND
    "startsMinute" % 15 = 0 AND "endsMinute" % 15 = 0),
  CONSTRAINT "StaffScheduleBlock_date_check" CHECK ("localDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);
CREATE UNIQUE INDEX "StaffScheduleBlock_id_barbershopId_key"
 ON "StaffScheduleBlock"("id","barbershopId");
CREATE INDEX "StaffScheduleBlock_barbershopId_staffMemberId_localDate_idx"
 ON "StaffScheduleBlock"("barbershopId","staffMemberId","localDate");
ALTER TABLE "StaffScheduleBlock" ADD CONSTRAINT "StaffScheduleBlock_barbershopId_fkey"
 FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffScheduleBlock" ADD CONSTRAINT "StaffScheduleBlock_staffMemberId_barbershopId_fkey"
 FOREIGN KEY ("staffMemberId","barbershopId") REFERENCES "StaffMember"("id","barbershopId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StaffInvitation" (
  "id" TEXT NOT NULL,
  "barbershopId" TEXT NOT NULL,
  "staffMemberId" TEXT NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "redeemedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");
CREATE INDEX "StaffInvitation_barbershopId_staffMemberId_expiresAt_idx"
 ON "StaffInvitation"("barbershopId","staffMemberId","expiresAt");
CREATE INDEX "StaffInvitation_email_expiresAt_idx"
 ON "StaffInvitation"("email","expiresAt");
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_barbershopId_fkey"
 FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_staffMemberId_barbershopId_fkey"
 FOREIGN KEY ("staffMemberId","barbershopId") REFERENCES "StaffMember"("id","barbershopId") ON DELETE RESTRICT ON UPDATE CASCADE;

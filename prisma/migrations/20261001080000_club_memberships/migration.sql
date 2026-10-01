-- Club Memberships 005B
-- Persistent customer-linked memberships, frozen entitlement snapshots and append-only usage ledger.

CREATE TYPE "MembershipStatus" AS ENUM (
    'ACTIVE',
    'PAST_DUE',
    'CANCELLED',
    'EXPIRED'
);

CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "membershipPlanId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "currentCycleStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "currentCycleEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "expiredAt" TIMESTAMPTZ(3),
    "planNameSnapshot" TEXT NOT NULL,
    "planPriceSnapshot" DECIMAL(10,2) NOT NULL,
    "planBenefitsSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Membership_cycle_range_check"
        CHECK ("currentCycleEndsAt" > "currentCycleStartsAt"),
    CONSTRAINT "Membership_price_snapshot_nonnegative_check"
        CHECK ("planPriceSnapshot" >= 0),
    CONSTRAINT "Membership_terminal_shape_check"
        CHECK (
            (
                "status" IN ('ACTIVE', 'PAST_DUE')
                AND "cancelledAt" IS NULL
                AND "expiredAt" IS NULL
            )
            OR (
                "status" = 'CANCELLED'
                AND "cancelledAt" IS NOT NULL
                AND "expiredAt" IS NULL
            )
            OR (
                "status" = 'EXPIRED'
                AND "expiredAt" IS NOT NULL
                AND "cancelledAt" IS NULL
            )
        )
);

CREATE TABLE "MembershipEntitlement" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceNameSnapshot" TEXT NOT NULL,
    "usageLimitPerCycle" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipEntitlement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MembershipEntitlement_usage_limit_check"
        CHECK ("usageLimitPerCycle" IS NULL OR "usageLimitPerCycle" >= 1)
);

CREATE TABLE "MembershipUsage" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "membershipEntitlementId" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ(3) NOT NULL,
    "cycleStartsAtSnapshot" TIMESTAMPTZ(3) NOT NULL,
    "cycleEndsAtSnapshot" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipUsage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MembershipUsage_cycle_range_check"
        CHECK ("cycleEndsAtSnapshot" > "cycleStartsAtSnapshot"),
    CONSTRAINT "MembershipUsage_used_at_cycle_check"
        CHECK (
            "usedAt" >= "cycleStartsAtSnapshot"
            AND "usedAt" < "cycleEndsAtSnapshot"
        )
);

CREATE UNIQUE INDEX "Membership_id_barbershopId_key"
ON "Membership"("id", "barbershopId");

CREATE INDEX "Membership_barbershopId_customerId_status_idx"
ON "Membership"("barbershopId", "customerId", "status");

CREATE INDEX "Membership_barbershopId_membershipPlanId_status_idx"
ON "Membership"("barbershopId", "membershipPlanId", "status");

CREATE INDEX "Membership_barbershopId_status_currentCycleEndsAt_idx"
ON "Membership"("barbershopId", "status", "currentCycleEndsAt");

CREATE UNIQUE INDEX "MembershipEntitlement_id_membershipId_barbershopId_key"
ON "MembershipEntitlement"("id", "membershipId", "barbershopId");

CREATE UNIQUE INDEX "MembershipEntitlement_barbershopId_membershipId_serviceId_key"
ON "MembershipEntitlement"("barbershopId", "membershipId", "serviceId");

CREATE INDEX "MembershipEntitlement_barbershopId_serviceId_idx"
ON "MembershipEntitlement"("barbershopId", "serviceId");

CREATE INDEX "MembershipEntitlement_barbershopId_membershipId_idx"
ON "MembershipEntitlement"("barbershopId", "membershipId");

CREATE UNIQUE INDEX "MembershipUsage_id_barbershopId_key"
ON "MembershipUsage"("id", "barbershopId");

CREATE INDEX "MembershipUsage_barbershopId_membershipId_cycleStartsAtSnapshot_cycleEndsAtSnapshot_idx"
ON "MembershipUsage"(
    "barbershopId",
    "membershipId",
    "cycleStartsAtSnapshot",
    "cycleEndsAtSnapshot"
);

CREATE INDEX "MembershipUsage_barbershopId_membershipEntitlementId_cycleStartsAtSnapshot_idx"
ON "MembershipUsage"(
    "barbershopId",
    "membershipEntitlementId",
    "cycleStartsAtSnapshot"
);

CREATE INDEX "MembershipUsage_barbershopId_usedAt_idx"
ON "MembershipUsage"("barbershopId", "usedAt");

ALTER TABLE "Membership"
ADD CONSTRAINT "Membership_barbershopId_fkey"
FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Membership"
ADD CONSTRAINT "Membership_customerId_barbershopId_fkey"
FOREIGN KEY ("customerId", "barbershopId")
REFERENCES "Customer"("id", "barbershopId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Membership"
ADD CONSTRAINT "Membership_membershipPlanId_barbershopId_fkey"
FOREIGN KEY ("membershipPlanId", "barbershopId")
REFERENCES "MembershipPlan"("id", "barbershopId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MembershipEntitlement"
ADD CONSTRAINT "MembershipEntitlement_barbershopId_fkey"
FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MembershipEntitlement"
ADD CONSTRAINT "MembershipEntitlement_membershipId_barbershopId_fkey"
FOREIGN KEY ("membershipId", "barbershopId")
REFERENCES "Membership"("id", "barbershopId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MembershipEntitlement"
ADD CONSTRAINT "MembershipEntitlement_serviceId_barbershopId_fkey"
FOREIGN KEY ("serviceId", "barbershopId")
REFERENCES "Service"("id", "barbershopId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MembershipUsage"
ADD CONSTRAINT "MembershipUsage_barbershopId_fkey"
FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MembershipUsage"
ADD CONSTRAINT "MembershipUsage_membershipId_barbershopId_fkey"
FOREIGN KEY ("membershipId", "barbershopId")
REFERENCES "Membership"("id", "barbershopId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MembershipUsage"
ADD CONSTRAINT "MembershipUsage_membershipEntitlementId_membershipId_barbershopId_fkey"
FOREIGN KEY ("membershipEntitlementId", "membershipId", "barbershopId")
REFERENCES "MembershipEntitlement"("id", "membershipId", "barbershopId")
ON DELETE RESTRICT ON UPDATE CASCADE;

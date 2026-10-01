-- Club Plans 005A
-- Tenant-owned commercial plan definitions and relational service entitlements.

CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "benefits" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MembershipPlan_price_nonnegative_check"
        CHECK ("price" >= 0),
    CONSTRAINT "MembershipPlan_archive_inactive_check"
        CHECK ("archivedAt" IS NULL OR "active" = false)
);

CREATE TABLE "MembershipPlanService" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "membershipPlanId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "usageLimitPerCycle" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlanService_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MembershipPlanService_usage_limit_check"
        CHECK ("usageLimitPerCycle" IS NULL OR "usageLimitPerCycle" >= 1)
);

CREATE UNIQUE INDEX "MembershipPlan_id_barbershopId_key"
ON "MembershipPlan"("id", "barbershopId");

CREATE INDEX "MembershipPlan_barbershopId_active_archivedAt_idx"
ON "MembershipPlan"("barbershopId", "active", "archivedAt");

CREATE UNIQUE INDEX "MembershipPlanService_id_barbershopId_key"
ON "MembershipPlanService"("id", "barbershopId");

CREATE UNIQUE INDEX "MembershipPlanService_barbershopId_membershipPlanId_serviceId_key"
ON "MembershipPlanService"("barbershopId", "membershipPlanId", "serviceId");

CREATE INDEX "MembershipPlanService_barbershopId_serviceId_idx"
ON "MembershipPlanService"("barbershopId", "serviceId");

CREATE INDEX "MembershipPlanService_barbershopId_membershipPlanId_idx"
ON "MembershipPlanService"("barbershopId", "membershipPlanId");

ALTER TABLE "MembershipPlan"
ADD CONSTRAINT "MembershipPlan_barbershopId_fkey"
FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MembershipPlanService"
ADD CONSTRAINT "MembershipPlanService_barbershopId_fkey"
FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MembershipPlanService"
ADD CONSTRAINT "MembershipPlanService_membershipPlanId_barbershopId_fkey"
FOREIGN KEY ("membershipPlanId", "barbershopId")
REFERENCES "MembershipPlan"("id", "barbershopId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MembershipPlanService"
ADD CONSTRAINT "MembershipPlanService_serviceId_barbershopId_fkey"
FOREIGN KEY ("serviceId", "barbershopId")
REFERENCES "Service"("id", "barbershopId")
ON DELETE RESTRICT ON UPDATE CASCADE;

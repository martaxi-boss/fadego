-- Billing Domain Foundation 006A
-- Provider-neutral separation of customer Club payments and FADEGO SaaS subscriptions.

CREATE TYPE "PaymentStatus" AS ENUM (
    'PENDING',
    'SUCCEEDED',
    'FAILED',
    'REFUNDED'
);

CREATE TYPE "PlatformSubscriptionStatus" AS ENUM (
    'ACTIVE',
    'PAST_DUE',
    'SUSPENDED'
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "cycleStartsAtSnapshot" TIMESTAMPTZ(3) NOT NULL,
    "cycleEndsAtSnapshot" TIMESTAMPTZ(3) NOT NULL,
    "providerKey" VARCHAR(64),
    "externalPaymentRef" VARCHAR(255),
    "paidAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "refundedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Payment_amount_nonnegative_check"
        CHECK ("amount" >= 0),
    CONSTRAINT "Payment_currency_check"
        CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "Payment_cycle_range_check"
        CHECK ("cycleEndsAtSnapshot" > "cycleStartsAtSnapshot"),
    CONSTRAINT "Payment_provider_ref_pair_check"
        CHECK (
            ("providerKey" IS NULL AND "externalPaymentRef" IS NULL)
            OR
            ("providerKey" IS NOT NULL AND "externalPaymentRef" IS NOT NULL)
        ),
    CONSTRAINT "Payment_status_timestamp_shape_check"
        CHECK (
            (
                "status" = 'PENDING'
                AND "paidAt" IS NULL
                AND "failedAt" IS NULL
                AND "refundedAt" IS NULL
            )
            OR (
                "status" = 'SUCCEEDED'
                AND "paidAt" IS NOT NULL
                AND "failedAt" IS NULL
                AND "refundedAt" IS NULL
            )
            OR (
                "status" = 'FAILED'
                AND "paidAt" IS NULL
                AND "failedAt" IS NOT NULL
                AND "refundedAt" IS NULL
            )
            OR (
                "status" = 'REFUNDED'
                AND "paidAt" IS NOT NULL
                AND "failedAt" IS NULL
                AND "refundedAt" IS NOT NULL
            )
        )
);

CREATE TABLE "PlatformSubscription" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "status" "PlatformSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "planKey" VARCHAR(64) NOT NULL,
    "priceSnapshot" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "currentPeriodStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "currentPeriodEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "providerKey" VARCHAR(64),
    "externalCustomerRef" VARCHAR(255),
    "externalSubscriptionRef" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSubscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlatformSubscription_plan_key_check"
        CHECK (char_length("planKey") BETWEEN 1 AND 64),
    CONSTRAINT "PlatformSubscription_price_nonnegative_check"
        CHECK ("priceSnapshot" >= 0),
    CONSTRAINT "PlatformSubscription_currency_check"
        CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "PlatformSubscription_period_range_check"
        CHECK ("currentPeriodEndsAt" > "currentPeriodStartsAt"),
    CONSTRAINT "PlatformSubscription_provider_subscription_check"
        CHECK (
            "externalSubscriptionRef" IS NULL
            OR "providerKey" IS NOT NULL
        )
);

CREATE UNIQUE INDEX "Payment_id_barbershopId_key"
ON "Payment"("id", "barbershopId");

CREATE UNIQUE INDEX "Payment_providerKey_externalPaymentRef_key"
ON "Payment"("providerKey", "externalPaymentRef");

CREATE INDEX "Payment_barbershopId_membershipId_createdAt_idx"
ON "Payment"("barbershopId", "membershipId", "createdAt");

CREATE INDEX "Payment_barbershopId_status_createdAt_idx"
ON "Payment"("barbershopId", "status", "createdAt");

CREATE UNIQUE INDEX "PlatformSubscription_barbershopId_key"
ON "PlatformSubscription"("barbershopId");

CREATE UNIQUE INDEX "PlatformSubscription_providerKey_externalSubscriptionRef_key"
ON "PlatformSubscription"("providerKey", "externalSubscriptionRef");

CREATE INDEX "PlatformSubscription_status_currentPeriodEndsAt_idx"
ON "PlatformSubscription"("status", "currentPeriodEndsAt");

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_barbershopId_fkey"
FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_membershipId_barbershopId_fkey"
FOREIGN KEY ("membershipId", "barbershopId")
REFERENCES "Membership"("id", "barbershopId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformSubscription"
ADD CONSTRAINT "PlatformSubscription_barbershopId_fkey"
FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

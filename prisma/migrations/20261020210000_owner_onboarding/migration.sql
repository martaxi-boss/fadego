-- A separate marker distinguishes a new, never-activated owner from a suspended user.
ALTER TABLE "User" ADD COLUMN "onboardingPending" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "OwnerInvitation" (
  "id" TEXT NOT NULL,
  "barbershopId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "redeemedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnerInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OwnerInvitation_membershipId_barbershopId_fkey" FOREIGN KEY ("membershipId", "barbershopId")
    REFERENCES "BarbershopMember"("id", "barbershopId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OwnerInvitation_tokenHash_key" ON "OwnerInvitation"("tokenHash");
CREATE INDEX "OwnerInvitation_barbershopId_membershipId_expiresAt_idx"
  ON "OwnerInvitation"("barbershopId", "membershipId", "expiresAt");

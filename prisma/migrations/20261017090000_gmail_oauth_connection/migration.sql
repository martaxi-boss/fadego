-- OAuth credentials are encrypted application-side with a distinct vault-held key.
-- Enrollment never enables email sending; sendingEnabledAt remains null.
CREATE TABLE "GmailOAuthAttempt" (
  "stateHash" VARCHAR(64) NOT NULL,
  "barbershopId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sealedVerifier" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "usedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GmailOAuthAttempt_pkey" PRIMARY KEY ("stateHash")
);
CREATE INDEX "GmailOAuthAttempt_barbershopId_expiresAt_idx"
  ON "GmailOAuthAttempt" ("barbershopId", "expiresAt");
CREATE INDEX "GmailOAuthAttempt_userId_expiresAt_idx"
  ON "GmailOAuthAttempt" ("userId", "expiresAt");
ALTER TABLE "GmailOAuthAttempt"
  ADD CONSTRAINT "GmailOAuthAttempt_barbershopId_fkey"
  FOREIGN KEY ("barbershopId") REFERENCES "Barbershop" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GmailOAuthAttempt"
  ADD CONSTRAINT "GmailOAuthAttempt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "GmailSenderConnection" (
  "barbershopId" TEXT NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "googleSubject" VARCHAR(255) NOT NULL,
  "sealedRefreshToken" TEXT NOT NULL,
  "authorizedByUserId" TEXT NOT NULL,
  "sendingEnabledAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GmailSenderConnection_pkey" PRIMARY KEY ("barbershopId")
);
CREATE INDEX "GmailSenderConnection_authorizedByUserId_idx"
  ON "GmailSenderConnection" ("authorizedByUserId");
ALTER TABLE "GmailSenderConnection"
  ADD CONSTRAINT "GmailSenderConnection_barbershopId_fkey"
  FOREIGN KEY ("barbershopId") REFERENCES "Barbershop" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GmailSenderConnection"
  ADD CONSTRAINT "GmailSenderConnection_authorizedByUserId_fkey"
  FOREIGN KEY ("authorizedByUserId") REFERENCES "User" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

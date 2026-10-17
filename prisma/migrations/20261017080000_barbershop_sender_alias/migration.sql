-- User-selected sender local-part; the delivery domain always stays verified and owned by FADEGO.
ALTER TABLE "Barbershop" ADD COLUMN "senderAlias" VARCHAR(32);

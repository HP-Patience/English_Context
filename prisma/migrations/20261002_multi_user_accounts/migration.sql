-- Additive account fields. Existing rows are backfilled by
-- scripts/migrate-single-user-to-admin.mjs before the final migration.
ALTER TABLE "User"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "statsSharingEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

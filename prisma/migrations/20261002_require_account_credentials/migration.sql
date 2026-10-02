-- Run only after migrate-single-user-to-admin.mjs and the null check.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "username" IS NULL OR "passwordHash" IS NULL) THEN
    RAISE EXCEPTION 'Cannot require account credentials while User rows still have null credentials';
  END IF;
END $$;

ALTER TABLE "User"
  ALTER COLUMN "username" SET NOT NULL,
  ALTER COLUMN "passwordHash" SET NOT NULL;

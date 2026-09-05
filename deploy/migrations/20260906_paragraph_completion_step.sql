BEGIN;

ALTER TABLE "UserStoryParagraphCompletion"
ADD COLUMN IF NOT EXISTS "step" INTEGER NOT NULL DEFAULT 1;

DROP INDEX IF EXISTS "UserStoryParagraphCompletion_userId_lessonId_paragraphIndex_idx";

CREATE INDEX IF NOT EXISTS "UserStoryParagraphCompletion_userId_lessonId_step_paragraphIndex_idx"
ON "UserStoryParagraphCompletion"("userId", "lessonId", "step", "paragraphIndex");

COMMIT;

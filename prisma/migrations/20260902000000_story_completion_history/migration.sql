CREATE TABLE "UserStoryParagraphCompletion" (
    "id" TEXT NOT NULL,
    "completionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "paragraphIndex" INTEGER NOT NULL,
    "completionDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserStoryParagraphCompletion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserStoryParagraphCompletion_paragraphIndex_check" CHECK ("paragraphIndex" >= 0)
);

CREATE TABLE "UserStoryStepCompletion" (
    "id" TEXT NOT NULL,
    "completionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "completionDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserStoryStepCompletion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserStoryStepCompletion_step_check" CHECK ("step" BETWEEN 1 AND 3)
);

CREATE TABLE "UserStoryLessonCompletion" (
    "id" TEXT NOT NULL,
    "completionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "completionDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserStoryLessonCompletion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserStoryParagraphBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "paragraphIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserStoryParagraphBookmark_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserStoryParagraphBookmark_paragraphIndex_check" CHECK ("paragraphIndex" >= 0)
);

CREATE UNIQUE INDEX "UserStoryParagraphCompletion_userId_completionId_key" ON "UserStoryParagraphCompletion"("userId", "completionId");
CREATE INDEX "UserStoryParagraphCompletion_userId_lessonId_paragraphIndex_idx" ON "UserStoryParagraphCompletion"("userId", "lessonId", "paragraphIndex");
CREATE INDEX "UserStoryParagraphCompletion_lessonId_completionDate_idx" ON "UserStoryParagraphCompletion"("lessonId", "completionDate");
CREATE UNIQUE INDEX "UserStoryStepCompletion_userId_completionId_key" ON "UserStoryStepCompletion"("userId", "completionId");
CREATE INDEX "UserStoryStepCompletion_userId_lessonId_step_idx" ON "UserStoryStepCompletion"("userId", "lessonId", "step");
CREATE INDEX "UserStoryStepCompletion_lessonId_completionDate_idx" ON "UserStoryStepCompletion"("lessonId", "completionDate");
CREATE UNIQUE INDEX "UserStoryLessonCompletion_userId_completionId_key" ON "UserStoryLessonCompletion"("userId", "completionId");
CREATE INDEX "UserStoryLessonCompletion_userId_lessonId_idx" ON "UserStoryLessonCompletion"("userId", "lessonId");
CREATE INDEX "UserStoryLessonCompletion_lessonId_completionDate_idx" ON "UserStoryLessonCompletion"("lessonId", "completionDate");
CREATE UNIQUE INDEX "UserStoryParagraphBookmark_userId_lessonId_paragraphIndex_key" ON "UserStoryParagraphBookmark"("userId", "lessonId", "paragraphIndex");
CREATE INDEX "UserStoryParagraphBookmark_lessonId_paragraphIndex_idx" ON "UserStoryParagraphBookmark"("lessonId", "paragraphIndex");

ALTER TABLE "UserStoryParagraphCompletion" ADD CONSTRAINT "UserStoryParagraphCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserStoryParagraphCompletion" ADD CONSTRAINT "UserStoryParagraphCompletion_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "StoryLesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserStoryStepCompletion" ADD CONSTRAINT "UserStoryStepCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserStoryStepCompletion" ADD CONSTRAINT "UserStoryStepCompletion_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "StoryLesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserStoryLessonCompletion" ADD CONSTRAINT "UserStoryLessonCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserStoryLessonCompletion" ADD CONSTRAINT "UserStoryLessonCompletion_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "StoryLesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserStoryParagraphBookmark" ADD CONSTRAINT "UserStoryParagraphBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserStoryParagraphBookmark" ADD CONSTRAINT "UserStoryParagraphBookmark_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "StoryLesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "UserStoryStepCompletion" ("id", "completionId", "userId", "lessonId", "step", "completionDate", "createdAt")
SELECT 'legacy-step-' || progress."id" || '-' || legacy."step",
       'legacy-step-' || progress."id" || '-' || legacy."step",
       progress."userId",
       progress."lessonId",
       legacy."step",
       legacy."completedAt"::date,
       legacy."completedAt"
FROM "UserStoryProgress" AS progress
CROSS JOIN LATERAL (
    VALUES
        (1, progress."step1CompletedAt"),
        (2, progress."step2CompletedAt"),
        (3, progress."step3CompletedAt")
) AS legacy("step", "completedAt")
WHERE legacy."completedAt" IS NOT NULL
ON CONFLICT ("userId", "completionId") DO NOTHING;

INSERT INTO "UserStoryLessonCompletion" ("id", "completionId", "userId", "lessonId", "completionDate", "createdAt")
SELECT 'legacy-lesson-' || progress."id",
       'legacy-lesson-' || progress."id",
       progress."userId",
       progress."lessonId",
       COALESCE(progress."completedAt", progress."step3CompletedAt")::date,
       COALESCE(progress."completedAt", progress."step3CompletedAt")
FROM "UserStoryProgress" AS progress
WHERE COALESCE(progress."completedAt", progress."step3CompletedAt") IS NOT NULL
ON CONFLICT ("userId", "completionId") DO NOTHING;

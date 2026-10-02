CREATE TABLE "LearningChallenge" (
  "id" TEXT NOT NULL, "createdById" TEXT NOT NULL, "title" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "target" INTEGER NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningChallenge_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LearningChallengeParticipant" (
  "id" TEXT NOT NULL, "challengeId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningChallengeParticipant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LearningMessage" (
  "id" TEXT NOT NULL, "senderId" TEXT NOT NULL, "recipientId" TEXT NOT NULL, "body" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'text', "readAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningMessage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LearningQuiz" (
  "id" TEXT NOT NULL, "senderId" TEXT NOT NULL, "recipientId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  CONSTRAINT "LearningQuiz_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LearningQuizWord" (
  "id" TEXT NOT NULL, "quizId" TEXT NOT NULL, "wordId" TEXT NOT NULL, "answered" BOOLEAN, "answeredAt" TIMESTAMP(3),
  CONSTRAINT "LearningQuizWord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LearningChallengeParticipant_challengeId_userId_key" ON "LearningChallengeParticipant"("challengeId", "userId");
CREATE UNIQUE INDEX "LearningQuizWord_quizId_wordId_key" ON "LearningQuizWord"("quizId", "wordId");
CREATE INDEX "LearningChallenge_status_startsAt_endsAt_idx" ON "LearningChallenge"("status", "startsAt", "endsAt");
CREATE INDEX "LearningChallengeParticipant_userId_idx" ON "LearningChallengeParticipant"("userId");
CREATE INDEX "LearningMessage_recipientId_readAt_createdAt_idx" ON "LearningMessage"("recipientId", "readAt", "createdAt");
CREATE INDEX "LearningMessage_senderId_createdAt_idx" ON "LearningMessage"("senderId", "createdAt");
CREATE INDEX "LearningQuiz_recipientId_createdAt_idx" ON "LearningQuiz"("recipientId", "createdAt");
CREATE INDEX "LearningQuiz_senderId_createdAt_idx" ON "LearningQuiz"("senderId", "createdAt");
CREATE INDEX "LearningQuizWord_wordId_idx" ON "LearningQuizWord"("wordId");
ALTER TABLE "LearningChallenge" ADD CONSTRAINT "LearningChallenge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningChallengeParticipant" ADD CONSTRAINT "LearningChallengeParticipant_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "LearningChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningChallengeParticipant" ADD CONSTRAINT "LearningChallengeParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningMessage" ADD CONSTRAINT "LearningMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningMessage" ADD CONSTRAINT "LearningMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningQuiz" ADD CONSTRAINT "LearningQuiz_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningQuiz" ADD CONSTRAINT "LearningQuiz_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningQuizWord" ADD CONSTRAINT "LearningQuizWord_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "LearningQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningQuizWord" ADD CONSTRAINT "LearningQuizWord_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

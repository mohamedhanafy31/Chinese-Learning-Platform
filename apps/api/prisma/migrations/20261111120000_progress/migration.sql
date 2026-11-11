-- CreateTable
CREATE TABLE "LessonProgress" (
    "userId" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "watchedSegments" JSONB NOT NULL DEFAULT '[]',
    "watchedSec" INTEGER NOT NULL DEFAULT 0,
    "durationSec" INTEGER,
    "lastPositionSec" INTEGER NOT NULL DEFAULT 0,
    "videoCompletedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastReportAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("userId","lessonId")
);

-- CreateIndex
CREATE INDEX "LessonProgress_userId_completedAt_idx" ON "LessonProgress"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "LessonProgress_lessonId_idx" ON "LessonProgress"("lessonId");

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "VideoProvider" AS ENUM ('LOCAL');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "activeVideoId" UUID;

-- CreateTable
CREATE TABLE "VideoAsset" (
    "id" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "provider" "VideoProvider" NOT NULL,
    "status" "VideoStatus" NOT NULL,
    "localKey" TEXT,
    "mime" TEXT,
    "durationSec" INTEGER,
    "sizeBytes" BIGINT,
    "originalName" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoAsset_localKey_key" ON "VideoAsset"("localKey");

-- CreateIndex
CREATE INDEX "VideoAsset_lessonId_idx" ON "VideoAsset"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_activeVideoId_key" ON "Lesson"("activeVideoId");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_activeVideoId_fkey" FOREIGN KEY ("activeVideoId") REFERENCES "VideoAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;


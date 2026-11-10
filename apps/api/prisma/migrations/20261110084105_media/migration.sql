-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE');

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "thumbnailId" UUID;

-- AlterTable
ALTER TABLE "Level" ADD COLUMN     "coverImageId" UUID;

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_checksum_key" ON "MediaAsset"("checksum");

-- AddForeignKey
ALTER TABLE "Level" ADD CONSTRAINT "Level_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_thumbnailId_fkey" FOREIGN KEY ("thumbnailId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

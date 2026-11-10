-- CreateEnum
CREATE TYPE "WebhookProvider" AS ENUM ('BUNNY');

-- AlterEnum
ALTER TYPE "VideoProvider" ADD VALUE 'BUNNY';

-- AlterTable
ALTER TABLE "VideoAsset" ADD COLUMN     "bunnyLibraryId" TEXT,
ADD COLUMN     "bunnyVideoId" TEXT,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "lastEventAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "provider" "WebhookProvider" NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_externalEventId_key" ON "WebhookEvent"("provider", "externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoAsset_bunnyVideoId_key" ON "VideoAsset"("bunnyVideoId");

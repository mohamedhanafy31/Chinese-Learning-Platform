CREATE TABLE "PendingVideoDelete" (
    "id" UUID NOT NULL,
    "bunnyVideoId" TEXT NOT NULL,
    "bunnyLibraryId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(500),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingVideoDelete_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingVideoDelete_bunnyVideoId_key"
    ON "PendingVideoDelete"("bunnyVideoId");

CREATE INDEX "PendingVideoDelete_nextAttemptAt_idx"
    ON "PendingVideoDelete"("nextAttemptAt");

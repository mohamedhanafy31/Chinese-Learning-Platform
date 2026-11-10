-- CreateTable
CREATE TABLE "Level" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "hanzi" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "topics" JSONB NOT NULL,
    "priceMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "sortOrder" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "firstPublishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" UUID NOT NULL,
    "levelId" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "description" JSONB,
    "hanzi" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isFreePreview" BOOLEAN NOT NULL DEFAULT false,
    "firstPublishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Level_slug_key" ON "Level"("slug");

-- CreateIndex
CREATE INDEX "Level_isPublished_archivedAt_sortOrder_idx" ON "Level"("isPublished", "archivedAt", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Level_sortOrder_key" ON "Level"("sortOrder");

-- CreateIndex
CREATE INDEX "Lesson_levelId_isPublished_archivedAt_sortOrder_idx" ON "Lesson"("levelId", "isPublished", "archivedAt", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_levelId_sortOrder_key" ON "Lesson"("levelId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

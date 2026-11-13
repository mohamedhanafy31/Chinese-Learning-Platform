UPDATE "Level" SET "priceMinor" = NULL WHERE "priceMinor" < 0;
UPDATE "PaymentTransaction" SET "amountMinor" = 0 WHERE "amountMinor" < 0;
UPDATE "Quiz" SET "passingScore" = GREATEST(0, LEAST(100, "passingScore"));
UPDATE "Question" SET "points" = 1 WHERE "points" <= 0;
UPDATE "VideoAsset" SET "sizeBytes" = NULL WHERE "sizeBytes" < 0;
UPDATE "VideoAsset" SET "durationSec" = NULL WHERE "durationSec" < 0;
UPDATE "LessonProgress" SET "watchedSec" = GREATEST(0, "watchedSec"), "lastPositionSec" = GREATEST(0, "lastPositionSec");
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Order" WHERE "amountMinor" <= 0) THEN
    RAISE EXCEPTION 'Cannot add Order amount constraint: existing rows have amountMinor <= 0';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "VideoAsset"
    WHERE ("provider" = 'LOCAL' AND "localKey" IS NULL)
       OR ("provider" = 'BUNNY' AND "bunnyVideoId" IS NULL)
  ) THEN
    RAISE EXCEPTION 'Cannot add VideoAsset provider-key constraint: existing rows are missing localKey or bunnyVideoId';
  END IF;
END $$;
WITH ranked AS (SELECT "id", row_number() OVER (PARTITION BY "userId", "levelId" ORDER BY "createdAt" DESC, "id" DESC) AS position FROM "Order" WHERE "status" = 'PENDING')
UPDATE "Order" o SET "status" = 'CANCELED' FROM ranked r WHERE o."id" = r."id" AND r.position > 1;
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_activeVideoId_fkey";
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_activeVideoId_fkey" FOREIGN KEY ("activeVideoId") REFERENCES "VideoAsset"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Level" ADD CONSTRAINT "Level_priceMinor_nonnegative" CHECK ("priceMinor" IS NULL OR "priceMinor" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_amountMinor_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_amountMinor_nonnegative" CHECK ("amountMinor" >= 0);
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_passingScore_range" CHECK ("passingScore" BETWEEN 0 AND 100);
ALTER TABLE "Question" ADD CONSTRAINT "Question_points_positive" CHECK ("points" > 0);
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_provider_key_required" CHECK (("provider" = 'LOCAL' AND "localKey" IS NOT NULL) OR ("provider" = 'BUNNY' AND "bunnyVideoId" IS NOT NULL));
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_sizeBytes_nonnegative" CHECK ("sizeBytes" IS NULL OR "sizeBytes" >= 0);
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_durationSec_nonnegative" CHECK ("durationSec" IS NULL OR "durationSec" >= 0);
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_positions_nonnegative" CHECK ("watchedSec" >= 0 AND "lastPositionSec" >= 0);
CREATE UNIQUE INDEX "Order_one_pending_per_user_level" ON "Order"("userId", "levelId") WHERE "status" = 'PENDING';

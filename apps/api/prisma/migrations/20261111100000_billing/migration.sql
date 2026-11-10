-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "WebhookProvider" ADD VALUE 'PAYMOB';

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "levelId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "specialReference" TEXT NOT NULL,
    "paymobIntentionId" TEXT,
    "paymobOrderId" TEXT,
    "clientSecret" TEXT,
    "checkoutUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "pending" BOOLEAN NOT NULL,
    "isRefund" BOOLEAN NOT NULL,
    "isVoided" BOOLEAN NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "payloadRedacted" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN "orderId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Order_specialReference_key" ON "Order"("specialReference");
CREATE UNIQUE INDEX "Order_paymobIntentionId_key" ON "Order"("paymobIntentionId");
CREATE UNIQUE INDEX "Order_paymobOrderId_key" ON "Order"("paymobOrderId");
CREATE INDEX "Order_userId_status_idx" ON "Order"("userId", "status");
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");
CREATE INDEX "Order_userId_levelId_status_idx" ON "Order"("userId", "levelId", "status");
CREATE UNIQUE INDEX "PaymentTransaction_providerTransactionId_key" ON "PaymentTransaction"("providerTransactionId");
CREATE INDEX "PaymentTransaction_orderId_createdAt_idx" ON "PaymentTransaction"("orderId", "createdAt");
CREATE INDEX "Enrollment_orderId_idx" ON "Enrollment"("orderId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "PendingPayment" ADD COLUMN "requestBody" TEXT,
ADD COLUMN "requestHeaders" TEXT,
ADD COLUMN "responsePayload" TEXT,
ADD COLUMN "responseStatus" INTEGER,
ADD COLUMN "txHash" TEXT,
ADD COLUMN "completedAt" TIMESTAMP(3);

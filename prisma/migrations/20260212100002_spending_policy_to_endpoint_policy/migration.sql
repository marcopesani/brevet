-- DropTable (RLS policies on SpendingPolicy are dropped with the table)
DROP TABLE "SpendingPolicy";

-- CreateTable
CREATE TABLE "EndpointPolicy" (
    "id" TEXT NOT NULL,
    "endpointPattern" TEXT NOT NULL,
    "payFromHotWallet" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "userId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EndpointPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EndpointPolicy_userId_endpointPattern_key" ON "EndpointPolicy"("userId", "endpointPattern");

-- AddForeignKey
ALTER TABLE "EndpointPolicy" ADD CONSTRAINT "EndpointPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

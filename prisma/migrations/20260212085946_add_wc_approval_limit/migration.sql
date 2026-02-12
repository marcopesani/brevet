-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SpendingPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "perRequestLimit" REAL NOT NULL DEFAULT 0.10,
    "perHourLimit" REAL NOT NULL DEFAULT 1.00,
    "perDayLimit" REAL NOT NULL DEFAULT 10.00,
    "wcApprovalLimit" REAL NOT NULL DEFAULT 5.00,
    "whitelistedEndpoints" TEXT NOT NULL DEFAULT '[]',
    "blacklistedEndpoints" TEXT NOT NULL DEFAULT '[]',
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SpendingPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SpendingPolicy" ("blacklistedEndpoints", "createdAt", "id", "perDayLimit", "perHourLimit", "perRequestLimit", "updatedAt", "userId", "whitelistedEndpoints") SELECT "blacklistedEndpoints", "createdAt", "id", "perDayLimit", "perHourLimit", "perRequestLimit", "updatedAt", "userId", "whitelistedEndpoints" FROM "SpendingPolicy";
DROP TABLE "SpendingPolicy";
ALTER TABLE "new_SpendingPolicy" RENAME TO "SpendingPolicy";
CREATE UNIQUE INDEX "SpendingPolicy_userId_key" ON "SpendingPolicy"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

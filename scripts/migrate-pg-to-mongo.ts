#!/usr/bin/env tsx
/**
 * PostgreSQL-to-MongoDB data migration script.
 *
 * Reads all data from a Supabase/PostgreSQL database and writes it to MongoDB Atlas,
 * preserving relationships by mapping UUID primary keys to new Mongoose ObjectIds.
 *
 * Usage:
 *   PG_CONNECTION_STRING="postgresql://..." MONGODB_URI="mongodb+srv://..." npx tsx scripts/migrate-pg-to-mongo.ts
 *   PG_CONNECTION_STRING="postgresql://..." MONGODB_URI="mongodb+srv://..." npx tsx scripts/migrate-pg-to-mongo.ts --dry-run
 */

import { Client as PgClient } from "pg";
import mongoose, { Types } from "mongoose";
import { User } from "../src/lib/models/user";
import { HotWallet } from "../src/lib/models/hot-wallet";
import { EndpointPolicy } from "../src/lib/models/endpoint-policy";
import { Transaction } from "../src/lib/models/transaction";
import { PendingPayment } from "../src/lib/models/pending-payment";

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const showHelp = args.includes("--help") || args.includes("-h");

if (showHelp) {
  console.log(`
PostgreSQL → MongoDB data migration script

Reads from PostgreSQL (Supabase) and writes to MongoDB Atlas.

Environment variables:
  PG_CONNECTION_STRING   PostgreSQL connection string (or use PSQL_URL)
  PSQL_URL               Alternative env var for PostgreSQL (used if PG_CONNECTION_STRING not set)
  MONGODB_URI            MongoDB connection string (required for non–dry-run)

Flags:
  --dry-run              Log what would be migrated without writing to MongoDB
  --help, -h             Show this help message

Examples:
  PG_CONNECTION_STRING="postgresql://..." MONGODB_URI="mongodb+srv://..." npx tsx scripts/migrate-pg-to-mongo.ts
  PG_CONNECTION_STRING="postgresql://..." MONGODB_URI="mongodb+srv://..." npx tsx scripts/migrate-pg-to-mongo.ts --dry-run
`);
  process.exit(0);
}

const PG_CONNECTION_STRING =
  process.env.PG_CONNECTION_STRING ?? process.env.PSQL_URL;
const MONGODB_URI = process.env.MONGODB_URI;

if (!PG_CONNECTION_STRING) {
  console.error(
    "Error: PG_CONNECTION_STRING or PSQL_URL environment variable is required"
  );
  process.exit(1);
}
if (!MONGODB_URI) {
  console.error("Error: MONGODB_URI environment variable is required");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Maps PostgreSQL UUID strings to new Mongoose ObjectIds */
type IdMap = Map<string, Types.ObjectId>;

interface MigrationSummary {
  users: { total: number; migrated: number; failed: number };
  hotWallets: { total: number; migrated: number; failed: number };
  endpointPolicies: { total: number; migrated: number; failed: number };
  transactions: { total: number; migrated: number; failed: number };
  pendingPayments: { total: number; migrated: number; failed: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newObjectId(): Types.ObjectId {
  return new Types.ObjectId();
}

function lookupUserId(
  uuid: string,
  userIdMap: IdMap,
  context: string
): Types.ObjectId | null {
  const oid = userIdMap.get(uuid);
  if (!oid) {
    console.warn(
      `  ⚠ ${context}: userId "${uuid}" not found in user map — skipping`
    );
    return null;
  }
  return oid;
}

// ---------------------------------------------------------------------------
// Migration functions
// ---------------------------------------------------------------------------

async function migrateUsers(
  pg: PgClient,
  userIdMap: IdMap,
  isDryRun: boolean
): Promise<{ total: number; migrated: number; failed: number }> {
  const { rows } = await pg.query(
    'SELECT id, email, "walletAddress", "createdAt", "updatedAt" FROM "User" ORDER BY "createdAt"'
  );
  const total = rows.length;
  let migrated = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const objectId = newObjectId();
    userIdMap.set(row.id, objectId);

    if (isDryRun) {
      console.log(
        `  [dry-run] User ${row.id} → ${objectId} (${row.email ?? row.walletAddress ?? "no identifier"})`
      );
      migrated++;
      continue;
    }

    try {
      await User.create({
        _id: objectId,
        email: row.email,
        walletAddress: row.walletAddress,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
      migrated++;
    } catch (err) {
      failed++;
      console.error(`  ✗ User ${row.id}: ${(err as Error).message}`);
    }

    process.stdout.write(`\r  Migrating users: ${i + 1}/${total}`);
  }
  if (!isDryRun && total > 0) console.log();

  return { total, migrated, failed };
}

async function migrateHotWallets(
  pg: PgClient,
  userIdMap: IdMap,
  isDryRun: boolean
): Promise<{ total: number; migrated: number; failed: number }> {
  const { rows } = await pg.query(
    'SELECT id, address, "encryptedPrivateKey", "userId", "createdAt", "updatedAt" FROM "HotWallet" ORDER BY "createdAt"'
  );
  const total = rows.length;
  let migrated = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const userId = lookupUserId(row.userId, userIdMap, `HotWallet ${row.id}`);
    if (!userId) {
      failed++;
      continue;
    }

    const objectId = newObjectId();

    if (isDryRun) {
      console.log(
        `  [dry-run] HotWallet ${row.id} → ${objectId} (address: ${row.address})`
      );
      migrated++;
      continue;
    }

    try {
      await HotWallet.create({
        _id: objectId,
        address: row.address,
        encryptedPrivateKey: row.encryptedPrivateKey,
        userId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
      migrated++;
    } catch (err) {
      failed++;
      console.error(`  ✗ HotWallet ${row.id}: ${(err as Error).message}`);
    }

    process.stdout.write(`\r  Migrating hot wallets: ${i + 1}/${total}`);
  }
  if (!isDryRun && total > 0) console.log();

  return { total, migrated, failed };
}

async function migrateEndpointPolicies(
  pg: PgClient,
  userIdMap: IdMap,
  isDryRun: boolean
): Promise<{ total: number; migrated: number; failed: number }> {
  const { rows } = await pg.query(
    'SELECT id, "endpointPattern", "payFromHotWallet", status, "userId", "archivedAt", "createdAt", "updatedAt" FROM "EndpointPolicy" ORDER BY "createdAt"'
  );
  const total = rows.length;
  let migrated = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const userId = lookupUserId(
      row.userId,
      userIdMap,
      `EndpointPolicy ${row.id}`
    );
    if (!userId) {
      failed++;
      continue;
    }

    const objectId = newObjectId();

    if (isDryRun) {
      console.log(
        `  [dry-run] EndpointPolicy ${row.id} → ${objectId} (${row.endpointPattern})`
      );
      migrated++;
      continue;
    }

    try {
      await EndpointPolicy.create({
        _id: objectId,
        endpointPattern: row.endpointPattern,
        autoSign: row.payFromHotWallet,
        status: row.status,
        userId,
        archivedAt: row.archivedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
      migrated++;
    } catch (err) {
      failed++;
      console.error(
        `  ✗ EndpointPolicy ${row.id}: ${(err as Error).message}`
      );
    }

    process.stdout.write(
      `\r  Migrating endpoint policies: ${i + 1}/${total}`
    );
  }
  if (!isDryRun && total > 0) console.log();

  return { total, migrated, failed };
}

async function migrateTransactions(
  pg: PgClient,
  userIdMap: IdMap,
  isDryRun: boolean
): Promise<{ total: number; migrated: number; failed: number }> {
  const { rows } = await pg.query(
    'SELECT id, amount, endpoint, "txHash", network, status, type, "userId", "responsePayload", "errorMessage", "responseStatus", "createdAt" FROM "Transaction" ORDER BY "createdAt"'
  );
  const total = rows.length;
  let migrated = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const userId = lookupUserId(
      row.userId,
      userIdMap,
      `Transaction ${row.id}`
    );
    if (!userId) {
      failed++;
      continue;
    }

    const objectId = newObjectId();

    if (isDryRun) {
      console.log(
        `  [dry-run] Transaction ${row.id} → ${objectId} (${row.endpoint}, ${row.amount})`
      );
      migrated++;
      continue;
    }

    try {
      await Transaction.create({
        _id: objectId,
        amount: row.amount,
        endpoint: row.endpoint,
        txHash: row.txHash,
        network: row.network,
        status: row.status,
        type: row.type,
        userId,
        responsePayload: row.responsePayload,
        errorMessage: row.errorMessage,
        responseStatus: row.responseStatus,
        createdAt: row.createdAt,
      });
      migrated++;
    } catch (err) {
      failed++;
      console.error(`  ✗ Transaction ${row.id}: ${(err as Error).message}`);
    }

    process.stdout.write(`\r  Migrating transactions: ${i + 1}/${total}`);
  }
  if (!isDryRun && total > 0) console.log();

  return { total, migrated, failed };
}

async function migratePendingPayments(
  pg: PgClient,
  userIdMap: IdMap,
  isDryRun: boolean
): Promise<{ total: number; migrated: number; failed: number }> {
  const { rows } = await pg.query(
    'SELECT id, "userId", url, method, amount, "paymentRequirements", status, signature, "requestBody", "requestHeaders", "responsePayload", "responseStatus", "txHash", "completedAt", "expiresAt", "createdAt" FROM "PendingPayment" ORDER BY "createdAt"'
  );
  const total = rows.length;
  let migrated = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const userId = lookupUserId(
      row.userId,
      userIdMap,
      `PendingPayment ${row.id}`
    );
    if (!userId) {
      failed++;
      continue;
    }

    const objectId = newObjectId();

    if (isDryRun) {
      console.log(
        `  [dry-run] PendingPayment ${row.id} → ${objectId} (${row.url}, ${row.status})`
      );
      migrated++;
      continue;
    }

    try {
      await PendingPayment.create({
        _id: objectId,
        userId,
        url: row.url,
        method: row.method,
        amount: row.amount,
        paymentRequirements: row.paymentRequirements,
        status: row.status,
        signature: row.signature,
        requestBody: row.requestBody,
        requestHeaders: row.requestHeaders,
        responsePayload: row.responsePayload,
        responseStatus: row.responseStatus,
        txHash: row.txHash,
        completedAt: row.completedAt,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
      });
      migrated++;
    } catch (err) {
      failed++;
      console.error(
        `  ✗ PendingPayment ${row.id}: ${(err as Error).message}`
      );
    }

    process.stdout.write(
      `\r  Migrating pending payments: ${i + 1}/${total}`
    );
  }
  if (!isDryRun && total > 0) console.log();

  return { total, migrated, failed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== PostgreSQL → MongoDB Migration ===");
  if (dryRun) {
    console.log("Mode: DRY RUN (no writes to MongoDB)\n");
  } else {
    console.log("Mode: LIVE — data will be written to MongoDB\n");
  }

  // Connect to PostgreSQL
  console.log("Connecting to PostgreSQL...");
  const pg = new PgClient({ connectionString: PG_CONNECTION_STRING });
  await pg.connect();
  console.log("  ✓ Connected to PostgreSQL\n");

  // Connect to MongoDB (skip in dry-run to avoid needing a real connection)
  if (!dryRun) {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI!);
    console.log("  ✓ Connected to MongoDB\n");
  } else {
    console.log("Skipping MongoDB connection (dry-run mode)\n");
  }

  const userIdMap: IdMap = new Map();
  const summary: MigrationSummary = {
    users: { total: 0, migrated: 0, failed: 0 },
    hotWallets: { total: 0, migrated: 0, failed: 0 },
    endpointPolicies: { total: 0, migrated: 0, failed: 0 },
    transactions: { total: 0, migrated: 0, failed: 0 },
    pendingPayments: { total: 0, migrated: 0, failed: 0 },
  };

  // 1. Users
  console.log("1/5 Users");
  summary.users = await migrateUsers(pg, userIdMap, dryRun);
  console.log(
    `  → ${summary.users.migrated}/${summary.users.total} migrated` +
      (summary.users.failed ? `, ${summary.users.failed} failed` : "") +
      "\n"
  );

  // 2. HotWallets
  console.log("2/5 HotWallets");
  summary.hotWallets = await migrateHotWallets(pg, userIdMap, dryRun);
  console.log(
    `  → ${summary.hotWallets.migrated}/${summary.hotWallets.total} migrated` +
      (summary.hotWallets.failed
        ? `, ${summary.hotWallets.failed} failed`
        : "") +
      "\n"
  );

  // 3. EndpointPolicies
  console.log("3/5 EndpointPolicies");
  summary.endpointPolicies = await migrateEndpointPolicies(
    pg,
    userIdMap,
    dryRun
  );
  console.log(
    `  → ${summary.endpointPolicies.migrated}/${summary.endpointPolicies.total} migrated` +
      (summary.endpointPolicies.failed
        ? `, ${summary.endpointPolicies.failed} failed`
        : "") +
      "\n"
  );

  // 4. Transactions
  console.log("4/5 Transactions");
  summary.transactions = await migrateTransactions(pg, userIdMap, dryRun);
  console.log(
    `  → ${summary.transactions.migrated}/${summary.transactions.total} migrated` +
      (summary.transactions.failed
        ? `, ${summary.transactions.failed} failed`
        : "") +
      "\n"
  );

  // 5. PendingPayments
  console.log("5/5 PendingPayments");
  summary.pendingPayments = await migratePendingPayments(
    pg,
    userIdMap,
    dryRun
  );
  console.log(
    `  → ${summary.pendingPayments.migrated}/${summary.pendingPayments.total} migrated` +
      (summary.pendingPayments.failed
        ? `, ${summary.pendingPayments.failed} failed`
        : "") +
      "\n"
  );

  // Summary
  console.log("=== Migration Summary ===");
  const collections = [
    ["Users", summary.users],
    ["HotWallets", summary.hotWallets],
    ["EndpointPolicies", summary.endpointPolicies],
    ["Transactions", summary.transactions],
    ["PendingPayments", summary.pendingPayments],
  ] as const;

  let totalMigrated = 0;
  let totalFailed = 0;
  for (const [name, stats] of collections) {
    totalMigrated += stats.migrated;
    totalFailed += stats.failed;
    const failStr = stats.failed > 0 ? ` (${stats.failed} failed)` : "";
    console.log(`  ${name}: ${stats.migrated}/${stats.total}${failStr}`);
  }
  console.log(`\nTotal: ${totalMigrated} migrated, ${totalFailed} failed`);
  if (dryRun) {
    console.log("\n(Dry run — no data was written to MongoDB)");
  }

  // Cleanup
  await pg.end();
  if (!dryRun && mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});

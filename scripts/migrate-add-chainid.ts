#!/usr/bin/env tsx
/**
 * Backfill chainId on existing MongoDB documents.
 *
 * Existing documents created before multi-chain support do not have a chainId
 * field. This script sets chainId to the deployment's default chain ID
 * (from NEXT_PUBLIC_CHAIN_ID, defaulting to 8453 / Base Mainnet).
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." npx tsx scripts/migrate-add-chainid.ts
 *   MONGODB_URI="mongodb+srv://..." npx tsx scripts/migrate-add-chainid.ts --dry-run
 */

import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const showHelp = args.includes("--help") || args.includes("-h");

if (showHelp) {
  console.log(`
Backfill chainId on existing MongoDB documents.

Sets chainId on documents that pre-date multi-chain support.
Default chainId comes from NEXT_PUBLIC_CHAIN_ID (defaults to 8453 / Base Mainnet).

Environment variables:
  MONGODB_URI              MongoDB connection string (required)
  NEXT_PUBLIC_CHAIN_ID     Chain ID to backfill (default: "8453")

Flags:
  --dry-run                Show what would be updated without writing
  --help, -h               Show this help message

Examples:
  MONGODB_URI="mongodb://localhost:27017/brevet" npx tsx scripts/migrate-add-chainid.ts --dry-run
  MONGODB_URI="mongodb://localhost:27017/brevet" npx tsx scripts/migrate-add-chainid.ts
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Error: MONGODB_URI environment variable is required");
  process.exit(1);
}

const defaultChainId = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || "8453",
  10
);

// ---------------------------------------------------------------------------
// Collections to migrate
// ---------------------------------------------------------------------------

const COLLECTIONS = [
  "hotwallets",
  "endpointpolicies",
  "transactions",
  "pendingpayments",
] as const;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Backfill chainId Migration ===");
  console.log(`Default chainId: ${defaultChainId}`);
  if (dryRun) {
    console.log("Mode: DRY RUN (no writes)\n");
  } else {
    console.log("Mode: LIVE — documents will be updated\n");
  }

  // Connect to MongoDB
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI!);
  console.log("  ✓ Connected\n");

  const db = mongoose.connection.db!;
  const filter = { chainId: { $exists: false } };
  let totalUpdated = 0;

  for (const collectionName of COLLECTIONS) {
    const collection = db.collection(collectionName);
    const count = await collection.countDocuments(filter);

    if (dryRun) {
      console.log(`${collectionName}: ${count} documents to update`);
    } else {
      const result = await collection.updateMany(filter, {
        $set: { chainId: defaultChainId },
      });
      const modified = result.modifiedCount;
      totalUpdated += modified;
      console.log(`${collectionName}: ${modified} documents updated`);
    }
  }

  if (!dryRun) {
    console.log(`\nTotal: ${totalUpdated} documents updated`);
  }

  // Cleanup
  await mongoose.disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});

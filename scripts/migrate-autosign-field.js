/**
 * Rename payFromHotWallet → autoSign in the endpointpolicies collection.
 *
 * This script is idempotent — safe to run multiple times. It only modifies
 * documents that still have the old field name.
 *
 * Usage:
 *   mongosh "$MONGODB_URI" scripts/migrate-autosign-field.js
 */

// ---------------------------------------------------------------------------
// Step 1: Count documents with the old field
// ---------------------------------------------------------------------------

const oldCount = db.endpointpolicies.countDocuments({
  payFromHotWallet: { $exists: true },
});

const alreadyMigrated = db.endpointpolicies.countDocuments({
  autoSign: { $exists: true },
});

const total = db.endpointpolicies.countDocuments();

print("=== Migrate payFromHotWallet → autoSign ===");
print(`Total documents in endpointpolicies: ${total}`);
print(`Documents with payFromHotWallet (to migrate): ${oldCount}`);
print(`Documents already using autoSign: ${alreadyMigrated}`);

// ---------------------------------------------------------------------------
// Step 2: Rename field (only if there are documents to migrate)
// ---------------------------------------------------------------------------

if (oldCount > 0) {
  print("\nRenaming payFromHotWallet → autoSign...");
  const result = db.endpointpolicies.updateMany(
    { payFromHotWallet: { $exists: true } },
    { $rename: { payFromHotWallet: "autoSign" } }
  );
  print(`  Modified: ${result.modifiedCount} documents`);
} else {
  print("\nNothing to migrate — no documents have the old field.");
}

// ---------------------------------------------------------------------------
// Step 3: Verify
// ---------------------------------------------------------------------------

print("\n=== Verification ===");
const remainingOld = db.endpointpolicies.countDocuments({
  payFromHotWallet: { $exists: true },
});
const newAutoSign = db.endpointpolicies.countDocuments({
  autoSign: { $exists: true },
});

print(`Documents still using payFromHotWallet: ${remainingOld}`);
print(`Documents using autoSign: ${newAutoSign}`);

if (remainingOld === 0) {
  print("\n✓ Migration complete — all documents use autoSign.");
} else {
  print("\n✗ WARNING: Some documents still have payFromHotWallet!");
}

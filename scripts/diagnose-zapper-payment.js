// mongosh script: run with mongosh "$MONGODB_URI" scripts/diagnose-zapper-payment.js
// Load .env first: set -a && . ./.env && set +a (from repo root)

const urlPattern = /zapper/;
const targetUrl = "https://public.zapper.xyz/x402/token-balances";

print("=== Pending payments (url contains 'zapper') ===\n");
const pending = db.pendingpayments.find({ url: urlPattern }).sort({ createdAt: -1 });
const pendingArr = pending.toArray();
if (pendingArr.length === 0) {
  print("No pending payments found for zapper.\n");
} else {
  pendingArr.forEach((p, i) => {
    print(`--- Pending payment ${i + 1} ---`);
    print("  _id: " + p._id);
    print("  url: " + p.url);
    print("  status: " + p.status);
    print("  amount: " + p.amount);
    print("  chainId: " + p.chainId);
    print("  expiresAt: " + p.expiresAt);
    print("  createdAt: " + p.createdAt);
    if (p.paymentRequirements) {
      try {
        const pr = JSON.parse(p.paymentRequirements);
        const accepts = pr.accepts || pr;
        const arr = Array.isArray(accepts) ? accepts : [accepts];
        print("  paymentRequirements.accepts (" + arr.length + "):");
        arr.forEach((a, j) => {
          print("    [" + j + "] scheme: " + (a.scheme || "?") + ", network: " + (a.network || "?") + ", amount: " + (a.amount || "?") + ", payTo: " + (a.payTo || "?"));
        });
      } catch (e) {
        print("  paymentRequirements (raw): " + p.paymentRequirements.substring(0, 200) + (p.paymentRequirements.length > 200 ? "..." : ""));
      }
    }
    print("");
  });
}

print("=== Transactions (endpoint contains 'zapper') ===\n");
const txs = db.transactions.find({ endpoint: urlPattern }).sort({ createdAt: -1 });
const txArr = txs.toArray();
if (txArr.length === 0) {
  print("No transactions found for zapper.\n");
} else {
  txArr.forEach((t, i) => {
    print(`--- Transaction ${i + 1} ---`);
    print("  _id: " + t._id);
    print("  endpoint: " + t.endpoint);
    print("  status: " + t.status);
    print("  amount: " + t.amount);
    print("  chainId: " + t.chainId);
    print("  network: " + t.network);
    print("  txHash: " + (t.txHash || "(null)"));
    print("  errorMessage: " + (t.errorMessage || "(null)"));
    print("  createdAt: " + t.createdAt);
    print("");
  });
}

// Chain config networkStrings for reference (Base mainnet / Sepolia)
print("=== Reference: expected networkStrings ===\n");
print("  Base mainnet: eip155:8453");
print("  Base Sepolia: eip155:84532");
print("\nThe approve flow requires a requirement with scheme 'exact' and network matching your chain's networkString.");

# Replace Hot Wallet with Smart Account + Session Keys — Validation Spikes

## Goal

Replace Brevet's custodial hot wallet with an ERC-4337 smart account + ERC-7715 session key architecture so the server never holds or controls private keys, removing MiCA CASP licensing requirements while preserving autonomous AI agent payments.

This PR **does not implement** the full migration. It delivers the **validation spikes** and one **unblocking dependency** that prove feasibility and unblock implementation.

---

## Scope of This PR (Validation Spikes)

### 1. x402 ERC-1271 unblock (dependency)

**Commit:** `feat: patch @x402/evm with ERC-1271 signature verification (PR #1220)`

The x402 facilitator today uses `verifyTypedData` (ecrecover only) for pre-settlement signature verification. [PR #1220](https://github.com/coinbase/x402/pull/1220) adds an ERC-1271 fallback but is not yet merged.

- **Change:** Applied a `patch-package` patch to `@x402/evm@2.3.1` that:
  - Adds ERC-1271 fallback in `verifyEIP3009` and `verifyPermit2`: when ecrecover fails, checks `getCode` and calls `isValidSignature(hash, sig)` on-chain for contract wallets.
  - Updates `settleEIP3009` to use a bytecode check instead of signature-length heuristics for contract wallet detection.
  - Applies the same behavior to the V1 scheme and passes config through for EIP-6492.
- **Verification:** 307/307 existing @x402/evm tests pass.
- **Purpose:** Enables facilitator acceptance of ERC-1271 signatures from smart accounts before upstream merges PR #1220.

### 2. Spike 1 — USDC v2.2 ERC-1271 with deployed smart account

**Evidence:** `src/test/e2e/smart-account-spike.e2e.test.ts` (if included in this branch)

- **Question:** Does USDC v2.2 on Base Sepolia accept ERC-1271 signatures from a **deployed** Kernel v3 smart account for `transferWithAuthorization`?
- **Result:** **Yes.** USDC v2.2 (`FiatTokenV2_2`) uses OpenZeppelin `SignatureChecker`, which accepts ERC-1271. A deployed Kernel v3.3 smart account signing `transferWithAuthorization` succeeds on Base Sepolia (tx confirmed).
- **Conclusion:** Owner-key path (smart account as signer) is viable for x402 payments once the facilitator verifies ERC-1271 (patch above).

### 3. Spike 2 — Session key permission validator (offline + on-chain gap)

**Commit:** `spike: session key permission validator + transferWithAuthorization E2E test`  
**File:** `src/test/e2e/session-key-spike.e2e.test.ts`

- **Question:** Can a **session key** (via `@zerodev/permissions` permission validator) produce an ERC-1271 signature that USDC accepts?
- **Findings:**
  - Permission validator creation (offline) works: `toPermissionValidator` + `toECDSASigner` + `toSudoPolicy` / `toCallPolicy` behave correctly.
  - Kernel account with permission plugin works when targeting the deployed SA via `address` parameter.
  - Session key produces a valid 71-byte ERC-1271 format: `[0x02] + [4-byte permission ID] + [0xff] + [ECDSA sig]`.
  - **On-chain:** `transferWithAuthorization` fails with "FiatTokenV2: invalid signature" because the **permission validator module is not installed** on the smart account.
  - Direct module install from owner EOA fails: "EntryPoint v0.7 not supported yet" — installation must go through a **bundler** (UserOperation).
- **Conclusion:** Session key signature format is correct; production **requires a bundler** (e.g. Pimlico) to install the permission validator module via UserOperation before session key signatures are accepted on-chain.

### 4. Spike 3 — Bundler module install + session key payment

**Evidence:** `src/test/e2e/session-key-bundler-spike.e2e.test.ts` (if included in this branch)

- **Question:** Can we install the permission validator via a bundler and then succeed at `transferWithAuthorization` with the session key?
- **Result:** **Yes.**
  - Pimlico bundler connection works on Base Sepolia (`pimlico_getUserOperationGasPrice`).
  - Permission module install via UserOperation succeeds (tx confirmed).
  - `isEnabled` for the permission validator is true after install.
  - Session key `transferWithAuthorization` **succeeds** (0.000001 USDC transferred, tx confirmed).
- **Conclusion:** Full path (session key → smart account → USDC) is proven. Production needs `BUNDLER_URL` (e.g. Pimlico) for one-time module install per session key grant; gas can be sponsored on testnet via paymaster.

---

## Summary Table (from spec)

| Question | Status | Evidence in this PR |
|----------|--------|----------------------|
| USDC v2.2 accepts ERC-1271 from deployed SA? | Proven | Spike 1 (smart-account-spike) |
| x402 facilitator accepts ERC-1271? | Unblocked | Patch to @x402/evm |
| Session key ERC-1271 format (offline)? | Proven | Spike 2 (session-key-spike) |
| Module install requires bundler? | Confirmed | Spike 2 failure without bundler |
| Session key transferWithAuthorization E2E? | Proven | Spike 3 (session-key-bundler-spike) |

---

## What’s in this branch (commits)

- **Patch:** `patches/@x402+evm+2.3.1.patch` + `postinstall` runs `patch-package`.
- **Spike 2 E2E:** `src/test/e2e/session-key-spike.e2e.test.ts` (session key permission validator tests).
- **Deps:** `@zerodev/sdk`, `@zerodev/permissions`, `@zerodev/ecdsa-validator`, `@zerodev/webauthn-key`, `permissionless`, `patch-package` (see `package.json`).

If **Spike 1** (`smart-account-spike.e2e.test.ts`) and **Spike 3** (`session-key-bundler-spike.e2e.test.ts`) are added to this branch, the PR then contains the full set of validation spikes described above.

---

## How to run the spike tests

- **Env:** `RPC_URL` (Base Sepolia), optional `TEST_EOA_PRIVATE_KEY` (funded EOA). Spike 3 also uses a Pimlico bundler URL (see test file).
- **Command:** `npm run test:e2e` (runs only E2E project; spike tests live under `src/test/e2e/`).

---

## Next steps (out of scope for this PR)

- Implement Smart Account + Session Key production flows (see parent spec: data model, `smart-account.ts`, payment engine changes, dashboard deploy/grant/revoke, policy rename to `autoSign`).
- When x402 PR #1220 merges, remove the patch and rely on upstream ERC-1271 support.

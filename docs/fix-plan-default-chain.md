# Fix plan: Remove default chain — require explicit chainId everywhere

## PR comments summary (from `gh`)

- **PR #60 (Cleanup)**  
  - **Transaction**: Schema has `chainId` required (no default). `createTransaction()` in `src/app/actions/payments.ts` (lines 159–168 and 218–225) does **not** pass `chainId` → Mongoose `ValidationError` when approving/failing payments.  
  - **PendingPayment**: Schema has `chainId` required. `createPendingPayment()` in `src/lib/data/payments.ts` only spreads `chainId` when defined; callers (e.g. MCP `x402_pay`) can pass `result.chainId` which may be undefined in edge cases → validation failure.  
  - **EndpointPolicy**: Schema has `chainId` with no default and not required; DTO requires `chainId`. Creating policies without `chainId` (e.g. from AddPolicyDialog if `chainId` were omitted) would create docs with undefined `chainId` → DTO parse can fail; policy creation should require chain.

- **PR #40**  
  - `wallet.ts` had its own `DEFAULT_CHAIN_ID` (8453) ignoring `TESTNET_ONLY`; should use `getDefaultChainConfig()` (or, per this plan, that path should require explicit chainId and not default).

- **AGENTS.md / CLAUDE.md**  
  - “Don’t default `chainId` (or similar) from env in schema; store explicitly (required) for multi-chain safety.”

---

## Principle

- **No defaults for persistence:** Any write (create/update) that touches `chainId` must receive it from the caller. If missing, the data layer or action must **error** (never substitute env or `getDefaultChainConfig()`).
- **Models:** `chainId` must be **required** and have **no default** in every schema that has it.
- **Actions:** Must always pass `chainId` into the data layer when creating/updating; if the logical caller (UI, MCP, payment flow) doesn’t have a chain, the action should return `err(...)` or throw instead of defaulting.

---

## Where “default chain” currently appears

| Location | Current behavior | Target behavior |
|----------|------------------|-----------------|
| **Models** | | |
| `src/lib/models/smart-account.ts` | `chainId: { required: true, default: defaultChainId }` | Remove default; keep required. |
| `src/lib/models/endpoint-policy.ts` | `chainId: { type: Number }` (no required) | Make `chainId` required; no default. |
| `src/lib/models/transaction.ts` | `chainId: { required: true }` (no default) | Already correct. |
| `src/lib/models/pending-payment.ts` | `chainId: { required: true }` (no default) | Already correct. |
| **Data layer** | | |
| `src/lib/data/transactions.ts` | `createTransaction(data)` with `chainId?: number`; only spreads when defined | Require `chainId` in type; throw or return error if missing. |
| `src/lib/data/payments.ts` | `createPendingPayment(data)` with `chainId?: number`; only spreads when defined | Require `chainId` in type; throw or return error if missing. |
| `src/lib/data/policies.ts` | `createPolicy(..., data)` with `data.chainId?: number`; only spreads when defined | Require `chainId` in data; reject when missing. |
| `src/lib/data/smart-account.ts` | `getSmartAccountBalance(userId, chainId?)`, `withdrawFromSmartAccount(..., chainId?)`, `listSmartAccountsWithBalances(..., chainId?)` use `chainId ?? getDefaultChainConfig().chain.id` | Require `chainId` in function signature; callers (actions) must pass it; remove default. |
| **Actions** | | |
| `src/app/actions/payments.ts` | `chainId = payment.chainId ?? getDefaultChainConfig().chain.id`; `createTransaction` calls omit `chainId` | Use `payment.chainId` only; if missing return `err("Missing chainId")`. Add `chainId: payment.chainId` to both `createTransaction` calls; if `payment.chainId` is ever missing, fail early with `err(...)`. |
| `src/app/actions/smart-account.ts` | `getSmartAccountBalanceAction(chainId?: number)` forwards optional chainId to data layer | Require `chainId: number`; callers (dashboard, etc.) must pass chain from context/cookie. |
| `src/app/actions/policies.ts` | `createPolicy(data)` with `data.chainId` optional | Require `data.chainId`; return `err("chainId is required")` if missing. |
| **Policy / x402** | | |
| `src/lib/policy.ts` | `defaultChainId` from env; `findMatchingPolicy` / `checkPolicy` use `chainId ?? defaultChainId` | Require `chainId` in `checkPolicy` and `findMatchingPolicy`; callers (only `executePayment`) already pass `selectedChainId` → no change at call site, but signature becomes required. |
| **UI / cookie** | | |
| `src/lib/chain-cookie.ts` | `getInitialChainIdFromCookie()` returns `getDefaultChainConfig().chain.id` when cookie missing/invalid | Prefer: when cookie missing, do not use env default. Option A: have `getValidatedChainId` accept “no cookie” and use first enabled chain only. Option B: keep current behavior only for this **read-only** “which chain to show” path and document that no persistence path may use it. Recommendation: Option A — `getInitialChainIdFromCookie` returns a sentinel or `null`; `getValidatedChainId(null, userId)` uses first enabled chain so “default” is user’s enabled set, not env. |
| **Other** | | |
| `src/lib/encryption.ts` | `chainId ?? getDefaultChainConfig().chain.id` for USDC domain | Caller must pass chainId; remove default or require chainId in the function that uses it. |
| `src/lib/walletconnect.ts` | `defaultChainId` for AppKit | Keep only for WalletConnect/AppKit **initial** chain (UI); not used for persistence. |
| `src/lib/walletconnect-signer.ts` | `getDefaultChainConfig().usdcDomain` fallback | Require chainId from caller; no default. |
| `src/lib/mcp/tools/x402-check-pending.ts` | Display fallback `paymentChainId ?? getDefaultChainConfig().chain.id` | For **display** only; can keep or use “unknown” when missing. |
| `src/components/*` (fund-wallet, withdraw-form, transaction-table, etc.) | Various `getDefaultChainConfig()` for display/explorer | These are UI-only (which chain to show). Either pass chainId from parent/context everywhere and remove default, or allow getDefaultChainConfig() only for non-persistence display. |

---

## Data / model layer — already handled or not

- **Transaction model:** Already requires `chainId`, no default. **Not handled:** `createTransaction` in data layer accepts optional `chainId` and omits it when undefined → Mongoose throws. So the model is correct; the data layer and callers must be fixed.
- **PendingPayment model:** Same: required, no default. **Not handled:** `createPendingPayment` accepts optional `chainId`; if undefined, doc has no chainId → Mongoose throws. MCP `x402_pay` passes `result.chainId` (always set when status is `pending_approval`); we should still make the data layer require it and error if missing.
- **EndpointPolicy model:** `chainId` is not required and has no default; DTO expects a number. **Not handled:** createPolicy can create without chainId; make schema `chainId` required and data layer require it.
- **SmartAccount model:** Has default from env. **Not handled:** Remove default; all creation paths already pass chainId.

---

## Recommended fix order

1. **Models (no defaults, require where needed)**  
   - `smart-account.ts`: Remove `defaultChainId`; set `chainId: { type: Number, required: true }` (no default).  
   - `endpoint-policy.ts`: Set `chainId: { type: Number, required: true }`.

2. **Data layer (require chainId, error if missing)**  
   - `transactions.ts`: In `createTransaction`, require `chainId: number`. If `data.chainId === undefined`, throw or return a typed error; always pass `chainId` into `Transaction.create`.  
   - `payments.ts`: In `createPendingPayment`, require `chainId: number`. If `data.chainId === undefined`, throw; always set `chainId` on the document.  
   - `policies.ts`: In `createPolicy`, require `data.chainId: number`. If missing, throw; always set `chainId` on create.  
   - `smart-account.ts`: In `getSmartAccountBalance`, `withdrawFromSmartAccount`, and any other function that currently uses `chainId ?? getDefaultChainConfig().chain.id`, change signature to require `chainId: number` and remove the fallback.

3. **Actions (always pass chainId, error when missing)**  
   - `payments.ts`:  
     - Before using `payment.chainId`, check: if `payment.chainId == null` or `payment.chainId === undefined`, return `err("Missing chainId for payment")`.  
     - Add `chainId: payment.chainId` to both `createTransaction` calls (success and network-error branches).  
   - `smart-account.ts`: Change `getSmartAccountBalanceAction(chainId?: number)` to `getSmartAccountBalanceAction(chainId: number)`; ensure all callers (e.g. dashboard) pass chainId (from `getValidatedChainId`).  
   - `policies.ts`: In `createPolicy`, require `data.chainId`; if missing, return `err("chainId is required")`.

4. **Policy and x402**  
   - `policy.ts`: Remove `defaultChainId`. Change `findMatchingPolicy(userId, endpoint, chainId?: number)` to `findMatchingPolicy(userId, endpoint, chainId: number)`. Change `checkPolicy(..., chainId?: number)` to `checkPolicy(..., chainId: number)`. Call site in `payment.ts` already passes `selectedChainId` (always set).

5. **Cookie / UI “default” (optional but recommended)**  
   - `chain-cookie.ts`: Option A — when cookie is missing, return a value that `getValidatedChainId` can interpret as “use first enabled chain only” (e.g. pass `null` and in `getValidatedChainId(cookieHeader, userId)` use “if no valid cookie, use enabled[0]” so no env default is used).  
   - Ensure no code path that **persists** data ever calls `getDefaultChainConfig()` or env default for `chainId`.

6. **Other call sites**  
   - `encryption.ts`, `walletconnect-signer.ts`: Require chainId from caller; remove default.  
   - MCP `x402-pay`: Already passes `result.chainId` into `createPendingPayment` when status is `pending_approval`; after data layer requires chainId, add an explicit check and return a tool error if `result.chainId` is undefined before calling `createPendingPayment`.  
   - Dashboard and pages that call `getSmartAccountBalanceAction` or similar: ensure they get `chainId` from `getValidatedChainId` (or equivalent) and pass it explicitly.

7. **Tests**  
   - Update any tests that create transactions, pending payments, or policies without `chainId`.  
   - Update tests that call `getSmartAccountBalance` / `withdrawFromSmartAccount` without chainId to pass an explicit chainId.

---

## Verification

- Grep for `getDefaultChainConfig()` and `defaultChainId` used in persistence paths: none should remain for **writing** data.  
- All `createTransaction`, `createPendingPayment`, `createPolicy`, and SmartAccount creation must be called with an explicit `chainId`.  
- All data layer functions that take `chainId` for a “target chain” must require it (no optional with env default).

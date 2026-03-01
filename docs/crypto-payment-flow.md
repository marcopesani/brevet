# Crypto Payment Flow: Signup to Payment

Technical description of what happens at the crypto/smart contract level from first wallet connection through payment execution.

---

## Phase 1: Wallet Connection & SIWE Authentication

### 1.1 Reown AppKit Initialization

On app load, the client-side `Providers` component calls `createAppKit()` from `@reown/appkit`, configured with:

- **WagmiAdapter** — wraps wagmi's `WagmiConfig` with SSR support (`cookieStorage`, `ssr: true`), using the WalletConnect `projectId` from `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
- **networks** — an array of `AppKitNetwork` objects for all 10 supported chains (Ethereum, Sepolia, Base, Base Sepolia, Arbitrum, Arbitrum Sepolia, OP Mainnet, OP Sepolia, Polygon, Polygon Amoy). Default network is `networks[0]` (Base mainnet, chain ID 8453).
- **siweConfig** — a custom SIWE configuration object that overrides Reown Cloud's default SIWx behavior.
- **features** — `{ analytics: false, email: false, socials: [] }` (wallet-only auth; no email/social login).

A guard in `Providers` watches `OptionsController.subscribeKey("siwx", ...)` and re-applies the custom `siweConfig.mapToSIWX()` if Reown Cloud attempts to override it with its own SIWx handler.

### 1.2 SIWE Message Creation

When the user clicks "Connect Wallet", Reown AppKit opens its modal (MetaMask, WalletConnect QR, Coinbase Wallet, etc.). After the user selects and connects a wallet, AppKit invokes the SIWE flow:

1. **`getNonce()`** — calls NextAuth's `getCsrfToken()` to fetch the CSRF token, used as the SIWE nonce.
2. **`getMessageParams()`** — returns `{ domain: window.location.host, uri: window.location.origin, chains: [1, 11155111, 8453, ...], statement: "Please sign with your account" }`.
3. **`createMessage()`** — receives a `SIWECreateMessageArgs` including the user's address (potentially in CAIP-10 format like `eip155:1:0xABC...`). The address is normalized to EIP-55 checksum format via `getAddress()` from viem. Then `formatMessage()` from `@reown/appkit-siwe` constructs the EIP-4361 SIWE message.

### 1.3 Wallet Signature

The connected wallet (MetaMask, WalletConnect-bridged mobile wallet, etc.) prompts the user to sign the SIWE message via `personal_sign`. This is an off-chain signature — no gas, no on-chain transaction. The wallet returns a 65-byte ECDSA signature (`v`, `r`, `s`).

### 1.4 Signature Verification & NextAuth Session

AppKit calls `verifyMessage({ message, signature })`, which calls NextAuth's `signIn("credentials", { message, signature, redirect: false })`. This triggers the CredentialsProvider's `authorize()` callback:

1. **Parse address** — `getAddressFromMessage(message)` extracts the signer's address from the SIWE message.
2. **Parse chainId** — extracted from the SIWE message's chain field in CAIP-2 format (`eip155:<chainId>`).
3. **Verify signature** — in production, the signature is verified via WalletConnect's public RPC (`https://rpc.walletconnect.org/v1/`) using EIP-1271 validation (supports both EOA `ecrecover` and smart contract wallets). In test mode (`NEXT_PUBLIC_TEST_MODE=true`), viem's local `verifyMessage()` is used instead.
4. **Upsert user** — if the wallet address doesn't exist in MongoDB, a new `User` document is created (see Phase 2). If the user exists but has no `enabledChains`, chains are backfilled.
5. **Ensure API key** — `ensureApiKey(userId)` atomically generates a `brv_<32 hex chars>` API key if one doesn't exist. The raw key is SHA-256 hashed before storage (`apiKeyHash`); only the 8-char prefix (`apiKeyPrefix`) is visible in the dashboard.
6. **JWT session** — NextAuth creates a JWT containing `{ userId, address, chainId }`, stored as an HTTP-only cookie. No database sessions — `strategy: "jwt"`.

After `signIn` succeeds, `onSignIn()` fires `window.location.href = "/dashboard"` (hard navigation).

---

## Phase 2: User Document Creation (First Signup)

On first authentication, `upsertUser(walletAddress)` in `auth-config.ts`:

1. Normalizes the wallet address to lowercase.
2. Creates a `User` document:
   ```
   {
     walletAddress: "0xabc...",
     enabledChains: [84532, 421614, 11155420, 80002, 11155111],  // testnets by default
     // email: null, humanHash: null, apiKeyHash: null (generated next)
   }
   ```
   If `DEFAULT_MAINNET_CHAINS_ENABLED=true`, mainnet chain IDs (1, 8453, 42161, 10, 137) are also included.

3. `ensureApiKey()` generates the API key (used for MCP bearer auth: `Authorization: Bearer brv_...`).

4. **humanHash** — generated lazily (on first MCP access or dashboard settings visit). The algorithm XOR-folds the 12-byte MongoDB ObjectId into 4 bytes, mapping each to a 256-word crypto-themed wordlist, producing identifiers like `satoshi_whale_diamond_rekt`. This becomes the MCP endpoint slug: `api/mcp/<humanHash>`.

No smart account or session key exists yet. No on-chain state has been created.

---

## Phase 3: Smart Account Setup (Per Chain)

When the user navigates to the Wallet page in the dashboard and clicks "Set Up" for a chain, the `setupSmartAccount(chainId)` server action fires.

### 3.1 Counterfactual Address Computation

`ensureSmartAccount(userId, ownerAddress, chainId)` in the data layer calls `computeSmartAccountAddress(ownerAddress, chainId)`, which uses:

```typescript
getKernelAddressFromECDSA({
  publicClient,                           // viem PublicClient for the target chain
  entryPoint: {
    address: entryPoint07Address,         // ERC-4337 EntryPoint v0.7
    version: "0.7",
  },
  kernelVersion: "0.3.3",                // ZeroDev Kernel v3.3
  eoaAddress: ownerAddress,              // The user's connected wallet (EOA)
  index: BigInt(0),                      // Account index (always 0)
})
```

This is a **CREATE2 address derivation** — it computes the deterministic address where the Kernel smart account *would* be deployed, without actually deploying it. The address is derived from:
- The **KernelFactory** contract's address (bundled in ZeroDev SDK for Kernel v0.3.3)
- The **ECDSA validator** plugin address
- The **owner's EOA address** as the salt
- The **EntryPoint v0.7** address (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`)

The smart account contract is **not yet deployed on-chain** at this point. It will be deployed automatically by the EntryPoint when the first UserOperation is submitted (counterfactual deployment via `initCode`).

### 3.2 Session Key Generation

`createSessionKey()` generates a fresh ECDSA keypair:

1. `generatePrivateKey()` from `viem/accounts` — produces a random 32-byte hex private key.
2. `privateKeyToAccount(privateKey)` — derives the corresponding public address.
3. `encryptPrivateKey(privateKey)` — encrypts the raw private key using **AES-256-GCM** with the server's `HOT_WALLET_ENCRYPTION_KEY` (32-byte key from env). Output format: `<12-byte IV hex>:<16-byte authTag hex>:<ciphertext hex>`.

### 3.3 Database Record

A `SmartAccount` document is created:

```
{
  userId: ObjectId,
  chainId: 8453,
  ownerAddress: "0xABC...",              // The user's EOA
  smartAccountAddress: "0xDEF...",       // Counterfactual Kernel address
  smartAccountVersion: "0.3.3",          // Kernel version
  sessionKeyAddress: "0x789...",         // Session key public address
  sessionKeyEncrypted: "iv:tag:cipher",  // AES-256-GCM encrypted private key
  sessionKeyStatus: "pending_grant",     // Not yet authorized on-chain
}
```

Unique index: `(userId, chainId)` — one smart account per user per chain.

At this point: the smart account address is known, the session key exists in the database, but **nothing is on-chain yet**. The session key has no permissions — it's just a private key stored encrypted server-side.

---

## Phase 4: Session Key Authorization (On-Chain Permission Installation)

This is the critical step that bridges off-chain key storage to on-chain permissions. The user clicks "Authorize Session Key" in the dashboard's `SessionKeyAuthCard` component.

### 4.1 Prepare (Server)

`prepareSessionKeyAuth(chainId)` server action:
- Fetches the smart account with the encrypted session key from MongoDB.
- Validates status is `pending_grant`.
- **Decrypts the session key** via `decryptPrivateKey()` (AES-256-GCM).
- Returns `{ sessionKeyHex, smartAccountAddress, ownerAddress }` to the client.

### 4.2 Build Validators (Client)

The client builds two ZeroDev validators:

**Sudo validator (owner's EOA):**
```typescript
const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
  signer: walletClient,           // The user's connected wallet (wagmi WalletClient)
  entryPoint: ENTRY_POINT,        // EntryPoint v0.7
  kernelVersion: KERNEL_VERSION,  // "0.3.3"
});
```
This wraps the user's EOA wallet (MetaMask/WalletConnect) as the **sudo** (owner) validator for the Kernel account. The sudo validator has unrestricted permissions — it can execute any call, change plugins, or upgrade the account.

**Permission validator (session key):**
```typescript
const sessionKeyAccount = privateKeyToAccount(sessionKeyHex);
const ecdsaSigner = await toECDSASigner({ signer: sessionKeyAccount });

const permissionValidator = await toPermissionValidator(publicClient, {
  signer: ecdsaSigner,
  policies: buildSessionKeyPolicies(usdcAddress, expiryTimestamp, spendLimitPerTxMicro),
  entryPoint: ENTRY_POINT,
  kernelVersion: KERNEL_VERSION,
});
```
This wraps the session key as a **regular** (restricted) validator with specific policies (see 4.3).

### 4.3 Session Key Policies

`buildSessionKeyPolicies()` constructs an array of two ZeroDev permission policies:

**1. Call Policy (v0.0.4):**
```typescript
toCallPolicy({
  policyVersion: CallPolicyVersion.V0_0_4,
  policyFlag: PolicyFlags.NOT_FOR_VALIDATE_USEROP,
  permissions: [
    {
      target: usdcAddress,                       // e.g., 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (Base USDC)
      abi: USDC_TRANSFER_ABI,
      functionName: "transferWithAuthorization",  // EIP-3009
      args: [null, null, { condition: LESS_THAN_OR_EQUAL, value: spendLimitPerTx }, null, null, null, null],
    },
    {
      target: usdcAddress,
      abi: USDC_TRANSFER_ABI,
      functionName: "transfer",                   // Standard ERC-20
      args: [null, { condition: LESS_THAN_OR_EQUAL, value: spendLimitPerTx }],
    },
  ],
})
```

- `NOT_FOR_VALIDATE_USEROP` flag means this call policy applies **only during EIP-1271 signature validation** (i.e., when the session key signs a typed data message like an EIP-3009 `TransferWithAuthorization`), **not during UserOp validation**. This is critical because the "enable" UserOp (which installs the permission module) has a no-op calldata (`to: zeroAddress, data: 0x`) — the call policy would reject it if applied during UserOp validation.
- The session key can **only** call USDC's `transfer()` or `transferWithAuthorization()`, with the value/amount constrained to `<= spendLimitPerTx`.

**2. Timestamp Policy:**
```typescript
toTimestampPolicy({
  validUntil: expiryTimestamp,  // Unix timestamp (e.g., 30 days from now)
})
```
The session key becomes invalid after this timestamp. Enforced on-chain by the permission validator.

### 4.4 Create Kernel Account (Client)

```typescript
const kernelAccount = await createKernelAccount(publicClient, {
  entryPoint: ENTRY_POINT,
  kernelVersion: KERNEL_VERSION,
  plugins: {
    sudo: ecdsaValidator,           // Owner's EOA — full control
    regular: permissionValidator,   // Session key — restricted to USDC transfers
  },
  address: smartAccountAddress,     // Pre-computed counterfactual address
});
```

This constructs a local representation of the **Kernel v3.3 smart account** with two plugin slots:
- **sudo** — the ECDSA validator backed by the user's wallet. Can do anything.
- **regular** — the permission validator backed by the session key. Restricted by the call + timestamp policies.

### 4.5 Create Kernel Account Client (Client)

```typescript
const bundlerTransport = createBundlerTransport(chainId);
// This is a custom viem transport that proxies JSON-RPC calls through
// the sendBundlerRequest() server action → ZeroDev bundler at:
// https://rpc.zerodev.app/api/v3/<ZERODEV_PROJECT_ID>/chain/<chainId>

const paymasterClient = createZeroDevPaymasterClient({
  chain: config.chain,
  transport: bundlerTransport,
});

const kernelClient = createKernelAccountClient({
  account: kernelAccount,
  chain: config.chain,
  bundlerTransport,
  client: publicClient,
  paymaster: {
    getPaymasterStubData(userOperation) {
      // Try free ZeroDev gas sponsorship first
      // If rejected, fall back to ERC-20 paymaster (gas paid in USDC)
      return paymasterClient.sponsorUserOperation({ userOperation, gasToken });
    },
    getPaymasterData(userOperation) {
      // Same two-tier strategy for actual execution
      return paymasterClient.sponsorUserOperation({ userOperation, gasToken });
    },
  },
});
```

The bundler transport is proxied through a server action (`sendBundlerRequest`) that:
- Validates the JSON-RPC method against an allowlist (`ALLOWED_BUNDLER_METHODS`).
- For `eth_sendUserOperation`, verifies the `sender` field matches the user's smart account address.
- Forwards to ZeroDev's bundler RPC.

### 4.6 Send Enable UserOperation (Client → On-Chain)

```typescript
const userOpHash = await kernelClient.sendUserOperation({
  callData: await kernelAccount.encodeCalls([
    { to: zeroAddress, value: BigInt(0), data: "0x" },  // No-op calldata
  ]),
});
```

This triggers several things:

1. **WalletConnect popup** — the user's wallet (MetaMask, etc.) prompts them to sign the UserOperation. The **sudo validator** (owner's EOA) signs. This is required because installing a new plugin (the permission validator) is a privileged action that needs the owner's authorization.

2. **UserOperation construction** — the ZeroDev SDK constructs a full ERC-4337 UserOperation:
   - `sender`: the smart account's counterfactual address
   - `nonce`: from the EntryPoint
   - `initCode`: if the smart account hasn't been deployed yet, this contains the KernelFactory's `createAccount()` calldata that deploys the Kernel proxy contract. **This is when the smart account is actually deployed on-chain** (first UserOp only).
   - `callData`: the no-op call (the actual purpose of this UserOp is to install the permission module, encoded in the `signature` field)
   - `signature`: contains the owner's ECDSA signature + the serialized permission validator configuration (policies, session key address, expiry). The Kernel contract's validation logic reads this to install the `regular` plugin.
   - `paymasterAndData`: from ZeroDev's paymaster (either sponsored gas or USDC gas token)

3. **Bundler submission** — the UserOp is sent to ZeroDev's bundler (`https://rpc.zerodev.app/api/v3/<projectId>/chain/<chainId>`) via `eth_sendUserOperation`.

4. **On-chain execution** — the ERC-4337 bundler wraps the UserOp in a transaction and submits it to the EntryPoint contract:
   - EntryPoint calls `validateUserOp()` on the Kernel proxy → Kernel delegates to the sudo ECDSA validator → owner's signature is verified via `ecrecover`.
   - EntryPoint calls `executeUserOp()` on the Kernel proxy → the no-op call executes (does nothing), but the **permission module is installed as the `regular` validator** in the Kernel's plugin storage.
   - Gas is paid by the ZeroDev paymaster (either sponsored or deducted from the smart account's USDC balance via the ERC-20 paymaster).

### 4.7 Wait for Confirmation (Client)

```typescript
const receipt = await kernelClient.waitForUserOperationReceipt({
  hash: userOpHash,
  timeout: 120_000,  // 2 minutes
});
```

Polls the bundler's `eth_getUserOperationReceipt` until the UserOp is included in a block.

### 4.8 Serialize Permission Account (Client)

```typescript
const serialized = await serializePermissionAccount(kernelAccount, sessionKeyHex);
```

`serializePermissionAccount()` from `@zerodev/permissions` captures the permission validator's full state (policies, signer config, addresses) into a serializable string. This allows future payment operations to **deserialize** the account instantly instead of reconstructing all validators from scratch.

### 4.9 Finalize (Server)

`finalizeSessionKey(chainId, grantTxHash, serialized, spendLimitPerTx, spendLimitDaily, expiryDays)` server action:

1. **Verify grant tx** — fetches the transaction receipt via `publicClient.getTransactionReceipt({ hash: grantTxHash })` and confirms `status === "success"`.
2. **Encrypt and store serialized account** — `encryptPrivateKey(serialized)` encrypts the serialized permission account using AES-256-GCM and stores it in the `SmartAccount.serializedAccount` field.
3. **Activate session key** — updates the `SmartAccount` document:
   ```
   {
     sessionKeyStatus: "active",
     sessionKeyGrantTxHash: "0x...",
     sessionKeyExpiry: Date (now + expiryDays),
     spendLimitPerTx: 50000000,    // 50 USDC in micro-units (6 decimals)
     spendLimitDaily: 500000000,   // 500 USDC in micro-units
   }
   ```

**After Phase 4, the on-chain state is:**
- A **Kernel v3.3 smart account** deployed at the counterfactual address (if this was the first UserOp).
- The **ECDSA validator** (owner's EOA) installed as the `sudo` plugin.
- The **Permission validator** (session key) installed as the `regular` plugin, with:
  - Call policy restricting to USDC `transfer()` and `transferWithAuthorization()` on the specific chain's USDC contract.
  - Spend limit per transaction enforced on-chain.
  - Timestamp policy with expiry.

---

## Phase 5: Payment Execution

Payments are triggered via the `x402_pay` MCP tool (by an AI agent) or via the dashboard. The flow enters `executePayment()`.

### 5.1 Initial HTTP Request

The system makes an HTTP request to the x402-protected URL with the original method, body, and sanitized headers. Blocked headers (authorization, cookie, payment-related, proxy headers) are stripped; CRLF characters are removed from values to prevent header injection.

If the response is **not HTTP 402**, it's returned directly — no payment needed.

### 5.2 Parse Payment Requirements

On HTTP 402, the x402 SDK's `x402HTTPClient.getPaymentRequiredResponse()` parses payment requirements from either:
- **V1 (body-based)**: JSON response body containing `{ accepts: [...] }` with `maxAmountRequired`, `payTo`, `scheme`, `network`.
- **V2 (header-based)**: `Payment-Required` header containing base64-encoded requirements with `amount`, `payTo`, `scheme`, `network`.

The `accepts` array may contain multiple entries for different chains/networks.

### 5.3 Chain Selection

`selectBestChain(accepts, userId)`:

1. Filter the endpoint's accepted networks to those the user has enabled.
2. For each candidate chain, check if the user has a smart account with `sessionKeyStatus === "active"`.
3. Among active accounts, query USDC `balanceOf(smartAccountAddress)` on each chain.
4. Select the chain with the **highest USDC balance**.
5. If no active smart account exists on any accepted chain, return the first supported chain (will trigger manual approval).

### 5.4 Session Key Expiry Check

If the session key's `sessionKeyExpiry` is in the past, update status to `"expired"` and reject. The user must re-authorize in the dashboard.

### 5.5 Policy Check

`checkPolicy(amount, endpoint, userId, chainId)`:

1. Query `EndpointPolicy` documents for the user + chain where `status === "active"`.
2. Find the **longest prefix match** against the endpoint URL. Pattern boundary enforcement: the character after the pattern must be `/`, `?`, `#`, or end-of-string (prevents `https://api` from matching `https://api-evil.com`).
3. **No match** → auto-create a `draft` policy for the endpoint's origin (scheme + host). Return `{ action: "rejected" }`. The user must activate the draft policy in the dashboard.
4. **Match with `autoSign: true`** → `{ action: "auto_sign" }`.
5. **Match with `autoSign: false`** → `{ action: "manual_approval" }`.

### 5.6 Balance Check

If the policy says `auto_sign`, verify the smart account's on-chain USDC balance is sufficient. If balance < amount, fall back to `manual_approval`.

---

## Phase 5A: Auto-Sign Path (Session Key Signs Server-Side)

When the policy action is `auto_sign`, the payment is executed entirely server-side without any user interaction.

### 5A.1 Reconstruct Smart Account Signer

**Fast path (serialized account exists):**
```typescript
const serialized = decryptPrivateKey(smartAccount.serializedAccount);  // AES-256-GCM decrypt
const sessionKeyHex = decryptPrivateKey(smartAccount.sessionKeyEncrypted);

const sessionKeyAccount = privateKeyToAccount(sessionKeyHex);
const ecdsaSigner = await toECDSASigner({ signer: sessionKeyAccount });

const kernelAccount = await deserializePermissionAccount(
  publicClient,
  ENTRY_POINT,           // EntryPoint v0.7
  KERNEL_VERSION,        // "0.3.3"
  serializedAccount,     // Decrypted serialized state
  ecdsaSigner,           // Session key as ECDSA signer
);
```

`deserializePermissionAccount()` from `@zerodev/permissions` reconstructs the full Kernel account object from the serialized state — **much faster** than rebuilding validators from scratch because it skips on-chain reads for validator configuration.

**Full path (no serialized account):**
```typescript
const ecdsaSigner = await toECDSASigner({ signer: sessionKeyAccount });

const permissionValidator = await toPermissionValidator(publicClient, {
  signer: ecdsaSigner,
  policies: buildSessionKeyPolicies(usdcAddress, expiryTimestamp, spendLimitPerTx),
  entryPoint: ENTRY_POINT,
  kernelVersion: KERNEL_VERSION,
});

const kernelAccount = await createKernelAccount(publicClient, {
  entryPoint: ENTRY_POINT,
  kernelVersion: KERNEL_VERSION,
  plugins: { regular: permissionValidator },
  address: smartAccountAddress,
});
```

Note: only the `regular` plugin is set (no `sudo`). The session key can only use its restricted permissions.

Both paths produce a `ClientEvmSigner`:
```typescript
{
  address: kernelAccount.address,
  signTypedData: (message) => kernelAccount.signTypedData({ domain, types, primaryType, message }),
}
```

### 5A.2 Create Payment Payload

```typescript
const client = new x402Client();
registerExactEvmScheme(client, { signer });
const httpClient = new x402HTTPClient(client);
const paymentPayload = await client.createPaymentPayload(paymentRequired);
```

`registerExactEvmScheme()` from `@x402/evm/exact/client` registers the "exact" payment scheme handlers for EVM chains. When `createPaymentPayload()` is called, the SDK:

1. Selects the accepted requirement matching the signer's chain.
2. Constructs an **EIP-3009 `TransferWithAuthorization`** typed data message:
   ```
   {
     from: smartAccountAddress,       // Payer (the Kernel smart account)
     to: payTo,                       // Recipient (from the 402 requirement)
     value: amount,                   // USDC amount in micro-units
     validAfter: 0,                   // Valid immediately
     validBefore: now + timeout,      // Deadline from maxTimeoutSeconds
     nonce: random 32 bytes,          // Unique nonce
   }
   ```
3. Calls `signer.signTypedData()` with the USDC contract's EIP-712 domain:
   ```
   {
     name: "USD Coin",
     version: "2",
     chainId: 8453,
     verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // USDC on Base
   }
   ```

4. **The Kernel account signs** — since the `regular` (permission) validator is active:
   - The Kernel contract's `signTypedData` implementation produces an **ERC-1271** contract signature.
   - The permission validator checks the call policy: is this a `transferWithAuthorization` call on the USDC contract with value <= spendLimitPerTx? If yes, the session key's ECDSA signature is wrapped in the ERC-1271 response.
   - The timestamp policy is checked: is `block.timestamp < validUntil`?

The result is a `PaymentPayload` containing the EIP-3009 authorization parameters and the ERC-1271 signature.

### 5A.3 Encode Payment Headers & Retry Request

```typescript
const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
// V1: X-PAYMENT header (JSON)
// V2: Payment-Signature header (base64-encoded)

const paidResponse = await safeFetch(url, {
  method,
  headers: { ...safeHeaders, ...paymentHeaders },
  body,
});
```

The x402-protected server receives the payment proof in headers, submits the `transferWithAuthorization` call to the USDC contract on-chain (via a **facilitator contract**), and returns the protected content along with settlement data.

### 5A.4 Settlement & Transaction Logging

From the response headers, `extractSettleResponse()` parses:
- **V2**: `Payment-Response` header
- **V1**: `X-PAYMENT-RESPONSE` header

```
SettleResponse {
  transaction: "0x...",    // On-chain tx hash of the USDC transfer
  network: "eip155:8453",  // Chain where settlement occurred
  success: true,
  payer: "0xDEF...",       // Smart account address
}
```

A `Transaction` document is created in MongoDB recording the payment amount, endpoint, settlement tx hash, chain, and status.

---

## Phase 5B: Manual Approval Path (Per-Payment In-Wallet Confirmation)

When the policy says `manual_approval` (or there's no active session key, or insufficient balance), the flow enters the manual approval path.

### 5B.1 Create Pending Payment

`executePayment()` returns `{ status: "pending_approval", paymentRequirements, amountRaw, asset, chainId }`.

The MCP tool creates a `PendingPayment` document:
```
{
  userId, url, method, amountRaw, asset, chainId,
  paymentRequirements: JSON.stringify(requirements),
  expiresAt: Date.now() + maxTimeoutSeconds * 1000,
  status: "pending",
  requestBody, requestHeaders,
}
```

The MCP tool returns to the AI agent: *"Payment of X USDC requires user approval. Payment ID: <id>. The user has been notified."*

### 5B.2 Dashboard Notification

The dashboard polls for pending payments via React Query (`usePendingPayments` hook, 10-second interval). When a new pending payment appears, it renders a `PendingPaymentCard` with a countdown timer and "Approve & Sign" / "Reject" buttons.

### 5B.3 User Signs EIP-3009 Authorization (Client-Side, In-Wallet)

When the user clicks "Approve & Sign":

1. **Parse requirement** — extract the matching `PaymentRequirements` entry for the payment's chain.
2. **Switch chain if needed** — if the wallet is on a different chain, call `switchChainAsync({ chainId })` via wagmi.
3. **Construct EIP-3009 authorization:**
   ```typescript
   const authorization = {
     from: walletAddress,         // The user's EOA (NOT the smart account)
     to: requirement.payTo,       // Recipient from the 402 requirement
     value: amountWei,            // USDC amount in micro-units
     validAfter: BigInt(0),       // Valid immediately
     validBefore: now + 300n,     // 5-minute validity window
     nonce: generateNonce(),      // Random 32 bytes
   };
   ```

4. **Sign via wallet** — `signTypedDataAsync()` from wagmi prompts the connected wallet (MetaMask/WalletConnect) to sign:
   ```typescript
   signTypedDataAsync({
     domain: chainConfig.usdcDomain,  // { name: "USD Coin", version: "2", chainId, verifyingContract: usdcAddress }
     types: authorizationTypes,        // From @x402/evm — the EIP-3009 TransferWithAuthorization struct
     primaryType: "TransferWithAuthorization",
     message: authorization,
   });
   ```

   This is a **direct EOA signature** (not through the smart account). The wallet pops up the MetaMask/WalletConnect signing dialog showing the USDC transfer details. The user reviews the amount, recipient, and signs.

5. **Submit to server action** — `approvePendingPayment(paymentId, signature, authorization)` sends the signature + authorization parameters to the server.

### 5B.4 Server Executes Payment

The `approvePendingPayment` server action:

1. Validates the pending payment exists and is still `"pending"` (not expired/rejected).
2. Checks expiry — if `Date.now() > expiresAt`, expire the payment and return error.
3. Constructs a `PaymentPayload` with the user's EOA signature and authorization parameters.
4. Encodes payment headers via `buildPaymentHeaders(paymentPayload)`.
5. Sends the paid request to the x402 endpoint with the payment proof.
6. The x402 server's facilitator calls USDC's `transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, signature)` on-chain, transferring USDC **directly from the user's EOA** to the recipient.
7. Extracts settlement response, logs the transaction, and updates the pending payment status to `"completed"` or `"failed"`.

### Key Difference: Auto-Sign vs Manual Approval

| Aspect | Auto-Sign (Session Key) | Manual Approval (EOA) |
|--------|------------------------|----------------------|
| **Who signs** | Session key (server-side, no user interaction) | User's EOA wallet (MetaMask/WalletConnect popup) |
| **Signature type** | ERC-1271 (contract signature from Kernel) | ECDSA (direct EOA signature) |
| **Funds source** | Smart account's USDC balance | User's EOA USDC balance |
| **On-chain call** | `transferWithAuthorization` signed by smart account | `transferWithAuthorization` signed by EOA |
| **Policy requirement** | Active endpoint policy with `autoSign: true` + active session key + sufficient balance | No active policy, or `autoSign: false`, or no session key |
| **Latency** | Instant (sub-second signing) | Requires user interaction (wallet popup + approval) |
| **Spend limits** | Enforced on-chain by call policy (spendLimitPerTx) + timestamp policy | No on-chain limits (user approves each individually) |

---

## Phase 6: Smart Account Withdrawal

Users can withdraw USDC from their smart account back to any address via the dashboard.

`withdrawFromSmartAccount(userId, amount, toAddress, chainId)`:

1. Fetch smart account with session key, validate status is `"active"` and not expired.
2. Decrypt session key and serialized account.
3. Reconstruct the Kernel account signer (same fast/full path as Phase 5A.1).
4. Create a full `KernelAccountClient` with ZeroDev bundler + paymaster:
   ```typescript
   const kernelClient = createKernelAccountClient({
     account: kernelAccount,
     chain: config.chain,
     bundlerTransport: http(getZeroDevBundlerRpc(chainId)),
     client: publicClient,
     paymaster: createZeroDevPaymasterClient({ chain, transport: http(zerodevRpc) }),
   });
   ```
5. Encode USDC `transfer(to, amount)` calldata and submit as a UserOperation:
   ```typescript
   const userOpHash = await kernelClient.sendUserOperation({
     callData: await kernelAccount.encodeCalls([
       { to: usdcAddress, value: BigInt(0), data: transferCalldata },
     ]),
   });
   ```
6. Wait for UserOp receipt (up to 120 seconds).
7. Log the withdrawal transaction.

The session key signs the UserOp, which is validated on-chain by the permission validator's call policy (allows `transfer` on USDC with amount <= spendLimitPerTx). Gas is handled by ZeroDev's paymaster.

---

## On-Chain Contract Summary

| Contract | Address | Role |
|----------|---------|------|
| **ERC-4337 EntryPoint v0.7** | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | Validates and executes UserOperations |
| **Kernel v3.3 Proxy** | Per-user, per-chain (CREATE2) | Smart account with plugin architecture |
| **ECDSA Validator** | ZeroDev SDK built-in | Sudo plugin — verifies owner's EOA signature |
| **Permission Validator** | ZeroDev SDK built-in | Regular plugin — enforces session key policies |
| **USDC (e.g., Base)** | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | ERC-20 token with EIP-3009 `transferWithAuthorization` |
| **ZeroDev Paymaster** | Via bundler RPC | Sponsors gas or deducts from USDC balance |
| **KernelFactory** | ZeroDev SDK built-in | Deploys Kernel proxies via CREATE2 |

## Supported Chains

| Chain | ID | USDC Address | Network String |
|-------|----|-------------|----------------|
| Ethereum | 1 | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | `eip155:1` |
| Sepolia | 11155111 | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | `eip155:11155111` |
| Base | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `eip155:8453` |
| Base Sepolia | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `eip155:84532` |
| Arbitrum One | 42161 | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | `eip155:42161` |
| Arbitrum Sepolia | 421614 | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` | `eip155:421614` |
| OP Mainnet | 10 | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` | `eip155:10` |
| OP Sepolia | 11155420 | `0x5fd84259d66Cd46123540766Be93DFE6D43130D7` | `eip155:11155420` |
| Polygon PoS | 137 | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | `eip155:137` |
| Polygon Amoy | 80002 | `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` | `eip155:80002` |

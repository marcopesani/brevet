/**
 * E2E Integration Test: Session Key Authorization Flow
 *
 * Exercises the exact production code path from session-key-auth-card.tsx:
 * 1. Build ECDSA owner validator + permission validator (session key + policies)
 * 2. Create KernelAccount with both sudo + regular plugins
 * 3. Submit enable UserOp via ZeroDev bundler (the step that was failing with AA23)
 * 4. Wait for on-chain confirmation
 * 5. Serialize and deserialize the permission account
 * 6. Sign EIP-712 typed data with the deserialized account
 *
 * This test requires:
 * - ZERODEV_PROJECT_ID env var (skips if not set)
 * - RPC_URL: Base Sepolia RPC endpoint (defaults to https://sepolia.base.org)
 * - TEST_EOA_PRIVATE_KEY: Owner EOA private key (defaults to testnet-only key)
 * - The deployed smart account at DEPLOYED_SA_ADDRESS must be on Base Sepolia
 * - The EOA must have ETH for gas (or ZeroDev paymaster must sponsor)
 *
 * These are real on-chain tests with real bundler interactions.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  createPublicClient,
  http,
  zeroAddress,
  parseAbi,
  type Hex,
  type Address,
} from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import crypto from "crypto";
import { CHAIN_CONFIGS, getZeroDevBundlerRpc } from "@/lib/chain-config";
import {
  buildSessionKeyPolicies,
  ENTRY_POINT,
  KERNEL_VERSION,
} from "@/lib/smart-account-policies";
import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { toPermissionValidator, serializePermissionAccount, deserializePermissionAccount } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";

// ---------------------------------------------------------------------------
// Config — mirrors session-key-auth-card.tsx defaults
// ---------------------------------------------------------------------------

const BASE_SEPOLIA_CHAIN_ID = 84532;
const chainConfig = CHAIN_CONFIGS[BASE_SEPOLIA_CHAIN_ID];
const USDC_ADDRESS = chainConfig.usdcAddress;
const USDC_DOMAIN = chainConfig.usdcDomain;

// Testnet-only EOA (never holds real funds)
// EOA address: 0x947Af7ad155f299a768874F73B3223f4a93260C6
const DEFAULT_TEST_KEY: Hex =
  "0xcfb0b3a1352e19a27df8bd158acf7eced224bfb9e68a76da9ef04091402b92a9";

const ownerPrivateKey = (process.env.TEST_EOA_PRIVATE_KEY as Hex) || DEFAULT_TEST_KEY;
const rpcUrl = process.env.RPC_URL || "https://sepolia.base.org";

// Same deployed smart account used in smart-account-payment.e2e.test.ts
const DEPLOYED_SA_ADDRESS: Address = "0xc7B29D24De8F48186106E9Fd42584776D2a915e8";

// Burn address — safe recipient
const RECIPIENT: Address = "0x000000000000000000000000000000000000dEaD";

// UI defaults (mirrors session-key-auth-card.tsx)
const SPEND_LIMIT_PER_TX_USDC = 50; // USDC
const SPEND_LIMIT_DAILY_USDC = 500; // USDC
const EXPIRY_DAYS = 30;

// USDC ABI for signing verification
const USDC_ABI = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature) external",
]);

const AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("E2E: Session Key Authorization Flow", () => {
  const ownerAccount = privateKeyToAccount(ownerPrivateKey);
  const sessionKeyPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionKeyPrivateKey);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  let isDeployed = false;
  let hasZeroDevProjectId = false;

  beforeAll(async () => {
    console.log("=== E2E: Session Key Authorization Flow ===");
    console.log("Owner EOA:", ownerAccount.address);
    console.log("Smart account:", DEPLOYED_SA_ADDRESS);
    console.log("Session key:", sessionKeyAccount.address);
    console.log("");

    hasZeroDevProjectId = !!process.env.ZERODEV_PROJECT_ID;

    const code = await publicClient.getCode({ address: DEPLOYED_SA_ADDRESS });
    isDeployed = code !== undefined && code !== "0x";

    console.log("Smart account deployed:", isDeployed);
    console.log("ZERODEV_PROJECT_ID set:", hasZeroDevProjectId);
    console.log(
      `Spend limit per tx: ${SPEND_LIMIT_PER_TX_USDC} USDC`,
      `| Daily: ${SPEND_LIMIT_DAILY_USDC} USDC`,
      `| Expiry: ${EXPIRY_DAYS} days`,
    );
    console.log("");
  });

  // -------------------------------------------------------------------------
  // Prerequisite checks
  // -------------------------------------------------------------------------
  it("should have a deployed smart account and ZERODEV_PROJECT_ID", ({ skip }) => {
    if (!hasZeroDevProjectId) {
      console.log("SKIP: ZERODEV_PROJECT_ID not set — cannot make bundler calls.");
      skip();
      return;
    }
    expect(isDeployed, `Smart account at ${DEPLOYED_SA_ADDRESS} is not deployed.`).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 1: Build permission validator with spend-limit policies
  // -------------------------------------------------------------------------
  it("should build permission validator with spend-limit policies", async ({ skip }) => {
    if (!hasZeroDevProjectId) { skip(); return; }
    if (!isDeployed) { skip(); return; }

    const expiryTimestamp = Math.floor(Date.now() / 1000 + EXPIRY_DAYS * 24 * 60 * 60);
    const spendLimitPerTxMicro = BigInt(SPEND_LIMIT_PER_TX_USDC * 1_000_000);
    const ecdsaSigner = await toECDSASigner({ signer: sessionKeyAccount });

    const permissionValidator = await toPermissionValidator(publicClient, {
      signer: ecdsaSigner,
      policies: buildSessionKeyPolicies(USDC_ADDRESS, expiryTimestamp, spendLimitPerTxMicro),
      entryPoint: ENTRY_POINT,
      kernelVersion: KERNEL_VERSION,
    });

    expect(permissionValidator.validatorType).toBe("PERMISSION");
    expect(permissionValidator.source).toBe("PermissionValidator");

    const id = permissionValidator.getIdentifier();
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");

    console.log("Permission validator ID:", id);
    console.log("Expiry timestamp:", expiryTimestamp);
  });

  // -------------------------------------------------------------------------
  // Test 2: Build Kernel account with sudo + regular plugins (matches UI)
  // -------------------------------------------------------------------------
  it("should build KernelAccount with owner (sudo) + session key (regular) plugins", async ({ skip }) => {
    if (!hasZeroDevProjectId) { skip(); return; }
    if (!isDeployed) { skip(); return; }

    const expiryTimestamp = Math.floor(Date.now() / 1000 + EXPIRY_DAYS * 24 * 60 * 60);
    const spendLimitPerTxMicro = BigInt(SPEND_LIMIT_PER_TX_USDC * 1_000_000);

    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
      signer: ownerAccount,
      entryPoint: ENTRY_POINT,
      kernelVersion: KERNEL_VERSION,
    });

    const ecdsaSigner = await toECDSASigner({ signer: sessionKeyAccount });
    const permissionValidator = await toPermissionValidator(publicClient, {
      signer: ecdsaSigner,
      policies: buildSessionKeyPolicies(USDC_ADDRESS, expiryTimestamp, spendLimitPerTxMicro),
      entryPoint: ENTRY_POINT,
      kernelVersion: KERNEL_VERSION,
    });

    const kernelAccount = await createKernelAccount(publicClient, {
      entryPoint: ENTRY_POINT,
      kernelVersion: KERNEL_VERSION,
      plugins: {
        sudo: ecdsaValidator,
        regular: permissionValidator,
      },
      address: DEPLOYED_SA_ADDRESS,
    });

    expect(kernelAccount.address.toLowerCase()).toBe(DEPLOYED_SA_ADDRESS.toLowerCase());
    console.log("KernelAccount built at:", kernelAccount.address);
  });

  // -------------------------------------------------------------------------
  // Test 3: Submit enable UserOp via bundler — this is the production step
  // that fails with AA23 reverted 0x1c49f4d1 in production.
  // -------------------------------------------------------------------------
  it(
    "should submit enable UserOp and install permission validator on-chain",
    { timeout: 180_000 },
    async ({ skip }) => {
      if (!hasZeroDevProjectId) { skip(); return; }
      if (!isDeployed) { skip(); return; }

      const expiryTimestamp = Math.floor(Date.now() / 1000 + EXPIRY_DAYS * 24 * 60 * 60);

      // Mirrors session-key-auth-card.tsx exactly (steps 3-7)
      const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer: ownerAccount,
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_VERSION,
      });

      const ecdsaSigner = await toECDSASigner({ signer: sessionKeyAccount });
      const spendLimitPerTxMicro = BigInt(SPEND_LIMIT_PER_TX_USDC * 1_000_000);

      const permissionValidator = await toPermissionValidator(publicClient, {
        signer: ecdsaSigner,
        policies: buildSessionKeyPolicies(USDC_ADDRESS, expiryTimestamp, spendLimitPerTxMicro),
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_VERSION,
      });

      const kernelAccount = await createKernelAccount(publicClient, {
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_VERSION,
        plugins: {
          sudo: ecdsaValidator,
          regular: permissionValidator,
        },
        address: DEPLOYED_SA_ADDRESS,
      });

      // Direct HTTP transport to ZeroDev bundler (no server proxy, no paymaster needed).
      // The call policy uses NOT_FOR_VALIDATE_USEROP so the no-op enable UserOp passes
      // without paymaster sponsorship — the smart account's ETH covers gas.
      const bundlerRpcUrl = getZeroDevBundlerRpc(BASE_SEPOLIA_CHAIN_ID);

      const kernelClient = createKernelAccountClient({
        account: kernelAccount,
        chain: baseSepolia,
        bundlerTransport: http(bundlerRpcUrl),
        client: publicClient,
      });

      console.log("Submitting enable UserOp to bundler...");
      console.log("Bundler URL:", bundlerRpcUrl.slice(0, 60) + "...");

      // This is the exact call from session-key-auth-card.tsx line 165-169
      const userOpHash = await kernelClient.sendUserOperation({
        callData: await kernelAccount.encodeCalls([
          { to: zeroAddress, value: BigInt(0), data: "0x" },
        ]),
      });

      console.log("UserOp submitted:", userOpHash);

      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: userOpHash,
        timeout: 120_000,
      });

      console.log("UserOp status:", receipt.success ? "SUCCESS" : "FAILED");
      console.log("Tx hash:", receipt.receipt.transactionHash);
      console.log("Gas used:", receipt.receipt.gasUsed.toString());

      expect(receipt.success, "UserOperation failed on-chain").toBe(true);
    },
  );

  // -------------------------------------------------------------------------
  // Test 4: Serialize and deserialize permission account (round-trip)
  // -------------------------------------------------------------------------
  it(
    "should serialize and deserialize permission account round-trip",
    { timeout: 60_000 },
    async ({ skip }) => {
      if (!hasZeroDevProjectId) { skip(); return; }
      if (!isDeployed) { skip(); return; }

      const expiryTimestamp = Math.floor(Date.now() / 1000 + EXPIRY_DAYS * 24 * 60 * 60);

      const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer: ownerAccount,
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_VERSION,
      });

      const ecdsaSigner = await toECDSASigner({ signer: sessionKeyAccount });
      const spendLimitPerTxMicro = BigInt(SPEND_LIMIT_PER_TX_USDC * 1_000_000);
      const permissionValidator = await toPermissionValidator(publicClient, {
        signer: ecdsaSigner,
        policies: buildSessionKeyPolicies(USDC_ADDRESS, expiryTimestamp, spendLimitPerTxMicro),
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_VERSION,
      });

      const kernelAccount = await createKernelAccount(publicClient, {
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_VERSION,
        plugins: {
          sudo: ecdsaValidator,
          regular: permissionValidator,
        },
        address: DEPLOYED_SA_ADDRESS,
      });

      // Serialize (mirrors session-key-auth-card.tsx line 182-185)
      const serialized = await serializePermissionAccount(kernelAccount, sessionKeyPrivateKey);

      expect(typeof serialized).toBe("string");
      expect(serialized.length).toBeGreaterThan(0);
      console.log("Serialized account length:", serialized.length, "chars");

      // Deserialize (mirrors src/lib/data/smart-account.ts withdrawFromSmartAccount)
      const deserialized = await deserializePermissionAccount(
        publicClient,
        ENTRY_POINT,
        KERNEL_VERSION,
        serialized,
        ecdsaSigner,
      );

      expect(deserialized.address.toLowerCase()).toBe(DEPLOYED_SA_ADDRESS.toLowerCase());
      console.log("Deserialized account address:", deserialized.address);
    },
  );

  // -------------------------------------------------------------------------
  // Test 5: Sign EIP-712 with deserialized session key account
  // -------------------------------------------------------------------------
  it(
    "should sign EIP-712 typed data with deserialized session key account",
    { timeout: 60_000 },
    async ({ skip }) => {
      if (!hasZeroDevProjectId) { skip(); return; }
      if (!isDeployed) { skip(); return; }

      const expiryTimestamp = Math.floor(Date.now() / 1000 + EXPIRY_DAYS * 24 * 60 * 60);

      const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer: ownerAccount,
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_VERSION,
      });

      const ecdsaSigner = await toECDSASigner({ signer: sessionKeyAccount });
      const spendLimitPerTxMicro = BigInt(SPEND_LIMIT_PER_TX_USDC * 1_000_000);
      const permissionValidator = await toPermissionValidator(publicClient, {
        signer: ecdsaSigner,
        policies: buildSessionKeyPolicies(USDC_ADDRESS, expiryTimestamp, spendLimitPerTxMicro),
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_VERSION,
      });

      const kernelAccount = await createKernelAccount(publicClient, {
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_VERSION,
        plugins: {
          sudo: ecdsaValidator,
          regular: permissionValidator,
        },
        address: DEPLOYED_SA_ADDRESS,
      });

      const serialized = await serializePermissionAccount(kernelAccount, sessionKeyPrivateKey);
      const deserialized = await deserializePermissionAccount(
        publicClient,
        ENTRY_POINT,
        KERNEL_VERSION,
        serialized,
        ecdsaSigner,
      );

      // Sign a USDC transferWithAuthorization
      const nonce = `0x${crypto.randomBytes(32).toString("hex")}` as Hex;
      const now = BigInt(Math.floor(Date.now() / 1000));
      const auth = {
        from: DEPLOYED_SA_ADDRESS,
        to: RECIPIENT,
        value: BigInt(1), // 0.000001 USDC
        validAfter: BigInt(0),
        validBefore: now + BigInt(600),
        nonce,
      };

      const signature = await deserialized.signTypedData({
        domain: USDC_DOMAIN,
        types: AUTHORIZATION_TYPES,
        primaryType: "TransferWithAuthorization",
        message: auth,
      });

      expect(signature).toMatch(/^0x[0-9a-fA-F]+$/);
      const sigByteLength = (signature.length - 2) / 2;
      expect(sigByteLength).toBeGreaterThan(65);

      console.log("Session key signature after round-trip:");
      console.log(`  Length: ${sigByteLength} bytes`);
      console.log(`  Prefix: ${signature.slice(0, 40)}...`);
      console.log("");
      console.log("=== SUCCESS ===");
      console.log("Full session key authorization pipeline verified:");
      console.log("  1. Build ECDSA owner validator");
      console.log("  2. Build permission validator with policies");
      console.log("  3. Create KernelAccount (sudo + regular)");
      console.log("  4. Submit enable UserOp to bundler");
      console.log("  5. Serialize permission account");
      console.log("  6. Deserialize permission account");
      console.log("  7. Sign EIP-712 typed data");
    },
  );
});

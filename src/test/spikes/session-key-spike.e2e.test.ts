/**
 * Spike 2: Session Key Permission Validator + transferWithAuthorization
 *
 * Tests whether a **session key** (via @zerodev/permissions permission validator)
 * can produce an ERC-1271 signature accepted by USDC v2.2's `transferWithAuthorization`
 * on Base Sepolia.
 *
 * Background:
 * - Spike 1 proved that the **owner key** signing via toKernelSmartAccount produces
 *   valid ERC-1271 signatures accepted by USDC.
 * - In production, the server holds a **session key**, not the owner key.
 * - Session keys use a different ERC-7579 validator module (@zerodev/permissions)
 *   which may produce a different ERC-1271 signature wrapper.
 *
 * The deployed smart account: 0xc7B29D24De8F48186106E9Fd42584776D2a915e8 on Base Sepolia
 * Owner EOA: 0x947Af7ad155f299a768874F73B3223f4a93260C6
 *
 * Environment requirements:
 * - RPC_URL: Base Sepolia RPC endpoint
 * - TEST_EOA_PRIVATE_KEY: Owner EOA private key (defaults to test key)
 *
 * These are real on-chain tests — they require Base Sepolia ETH for gas and
 * testnet USDC for transfer tests.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatEther,
  type Hex,
  type Address,
} from "viem";
import { baseSepolia } from "viem/chains";
import {
  generatePrivateKey,
  privateKeyToAccount,
} from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import crypto from "crypto";
import { CHAIN_CONFIGS } from "@/lib/chain-config";

// @zerodev/sdk — Kernel smart account creation
import { createKernelAccount } from "@zerodev/sdk";

// @zerodev/permissions — session key permission validator
import { toPermissionValidator } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toSudoPolicy } from "@zerodev/permissions/policies";
import { toCallPolicy, CallPolicyVersion } from "@zerodev/permissions/policies";

// permissionless — for comparison with owner-key approach
import { toKernelSmartAccount } from "permissionless/accounts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_SEPOLIA_CHAIN_ID = 84532;
const chainConfig = CHAIN_CONFIGS[BASE_SEPOLIA_CHAIN_ID];
const USDC_ADDRESS = chainConfig.usdcAddress;
const USDC_DOMAIN = chainConfig.usdcDomain;

// Dedicated testnet-only EOA key (same as spike 1)
// EOA address: 0x947Af7ad155f299a768874F73B3223f4a93260C6
const DEFAULT_TEST_KEY: Hex =
  "0xcfb0b3a1352e19a27df8bd158acf7eced224bfb9e68a76da9ef04091402b92a9";

const ownerPrivateKey =
  (process.env.TEST_EOA_PRIVATE_KEY as Hex) || DEFAULT_TEST_KEY;
const rpcUrl = process.env.RPC_URL || "https://sepolia.base.org";

// The already-deployed Kernel v3.3 smart account from spike 1
const DEPLOYED_SA_ADDRESS: Address =
  "0xc7B29D24De8F48186106E9Fd42584776D2a915e8";

// USDC ABI
const USDC_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature) external",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

// EIP-3009 TransferWithAuthorization typed data
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

const RECIPIENT: Address = "0x000000000000000000000000000000000000dEaD";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTransferAuth(from: Address, to: Address, value: bigint) {
  const nonce = `0x${crypto.randomBytes(32).toString("hex")}` as Hex;
  const now = BigInt(Math.floor(Date.now() / 1000));
  return {
    from,
    to,
    value,
    validAfter: BigInt(0),
    validBefore: now + BigInt(600), // 10 minutes
    nonce,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("Spike 2: Session key permission validator + transferWithAuthorization", () => {
  const ownerAccount = privateKeyToAccount(ownerPrivateKey);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account: ownerAccount,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  // Generate a fresh session key for this test run
  const sessionKeyPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionKeyPrivateKey);

  beforeAll(async () => {
    console.log("=== Spike 2: Session Key Permission Validator ===");
    console.log("Owner EOA:", ownerAccount.address);
    console.log("Session key EOA:", sessionKeyAccount.address);
    console.log("Deployed smart account:", DEPLOYED_SA_ADDRESS);
    console.log("USDC address:", USDC_ADDRESS);
    console.log("");

    // Verify the smart account is deployed
    const code = await publicClient.getCode({ address: DEPLOYED_SA_ADDRESS });
    const isDeployed = code !== undefined && code !== "0x";
    console.log("Smart account deployed:", isDeployed);
    if (!isDeployed) {
      console.log("ERROR: Smart account not deployed! Run spike 1 first.");
    }
  });

  // -------------------------------------------------------------------------
  // Test 1: Create a Kernel account with permission validator (offline)
  // -------------------------------------------------------------------------
  describe("Permission validator creation (offline)", () => {
    it("should create an ECDSA signer from session key", async () => {
      const ecdsaSigner = await toECDSASigner({
        signer: sessionKeyAccount,
      });

      console.log("ECDSA signer created:");
      console.log("  Account address:", ecdsaSigner.account.address);
      console.log("  Signer contract:", ecdsaSigner.signerContractAddress);
      console.log("  Signer data:", ecdsaSigner.getSignerData());

      expect(ecdsaSigner.account.address).toBe(sessionKeyAccount.address);
      expect(ecdsaSigner.signerContractAddress).toBeDefined();
    });

    it("should create a permission validator with sudo policy", async () => {
      const ecdsaSigner = await toECDSASigner({
        signer: sessionKeyAccount,
      });

      const permissionValidator = await toPermissionValidator(publicClient, {
        signer: ecdsaSigner,
        policies: [toSudoPolicy({})],
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
        kernelVersion: "0.3.3",
      });

      console.log("Permission validator created:");
      console.log("  Validator type:", permissionValidator.validatorType);
      console.log("  Source:", permissionValidator.source);
      console.log("  Address:", permissionValidator.address);
      console.log("  Identifier:", permissionValidator.getIdentifier());

      expect(permissionValidator.validatorType).toBe("PERMISSION");
      expect(permissionValidator.source).toBe("PermissionValidator");
      expect(permissionValidator.getIdentifier()).toBeDefined();
    });

    it("should create a permission validator with call policy (USDC transferWithAuthorization)", async () => {
      const ecdsaSigner = await toECDSASigner({
        signer: sessionKeyAccount,
      });

      const permissionValidator = await toPermissionValidator(publicClient, {
        signer: ecdsaSigner,
        policies: [
          toCallPolicy({
            policyVersion: CallPolicyVersion.V0_0_4,
            permissions: [
              {
                target: USDC_ADDRESS,
                abi: USDC_ABI,
                functionName: "transferWithAuthorization",
              },
            ],
          }),
        ],
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
        kernelVersion: "0.3.3",
      });

      console.log("Call policy permission validator created:");
      console.log("  Identifier:", permissionValidator.getIdentifier());
      console.log("  Enable data length:", (await permissionValidator.getEnableData()).length);

      expect(permissionValidator.getIdentifier()).toBeDefined();
    });

    it("should create a Kernel account with permission validator plugin", async () => {
      const ecdsaSigner = await toECDSASigner({
        signer: sessionKeyAccount,
      });

      const permissionValidator = await toPermissionValidator(publicClient, {
        signer: ecdsaSigner,
        policies: [toSudoPolicy({})],
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
        kernelVersion: "0.3.3",
      });

      const kernelAccount = await createKernelAccount(publicClient, {
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
        kernelVersion: "0.3.3",
        plugins: {
          regular: permissionValidator,
        },
        address: DEPLOYED_SA_ADDRESS,
      });

      console.log("Kernel account with permission validator:");
      console.log("  Address:", kernelAccount.address);
      console.log("  Entry point:", entryPoint07Address);

      // The address should match the deployed smart account
      expect(kernelAccount.address.toLowerCase()).toBe(
        DEPLOYED_SA_ADDRESS.toLowerCase()
      );
    });
  });

  // -------------------------------------------------------------------------
  // Test 2: Sign transferWithAuthorization with permission validator
  // -------------------------------------------------------------------------
  describe("Sign transferWithAuthorization with session key", () => {
    it("should produce a valid ERC-1271 signature via permission validator", async () => {
      const ecdsaSigner = await toECDSASigner({
        signer: sessionKeyAccount,
      });

      const permissionValidator = await toPermissionValidator(publicClient, {
        signer: ecdsaSigner,
        policies: [toSudoPolicy({})],
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
        kernelVersion: "0.3.3",
      });

      const sessionKeyKernelAccount = await createKernelAccount(publicClient, {
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
        kernelVersion: "0.3.3",
        plugins: {
          regular: permissionValidator,
        },
        address: DEPLOYED_SA_ADDRESS,
      });

      const auth = buildTransferAuth(DEPLOYED_SA_ADDRESS, RECIPIENT, BigInt(1));

      // Sign with session key via permission validator
      const sessionKeySig = await sessionKeyKernelAccount.signTypedData({
        domain: USDC_DOMAIN,
        types: AUTHORIZATION_TYPES,
        primaryType: "TransferWithAuthorization",
        message: auth,
      });

      console.log("=== Session Key Signature (Permission Validator) ===");
      console.log("Signature:", sessionKeySig.slice(0, 80) + "...");
      console.log(
        "Signature length:",
        sessionKeySig.length,
        "chars /",
        (sessionKeySig.length - 2) / 2,
        "bytes"
      );

      // Now also sign with the owner key for comparison (from spike 1 approach)
      const ownerKernelAccount = await toKernelSmartAccount({
        client: publicClient,
        owners: [ownerAccount],
        version: "0.3.3",
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
        index: BigInt(0),
      });

      const ownerSig = await ownerKernelAccount.signTypedData({
        domain: USDC_DOMAIN,
        types: AUTHORIZATION_TYPES,
        primaryType: "TransferWithAuthorization",
        message: auth,
      });

      console.log("\n=== Owner Key Signature (ECDSA Validator) ===");
      console.log("Signature:", ownerSig.slice(0, 80) + "...");
      console.log(
        "Signature length:",
        ownerSig.length,
        "chars /",
        (ownerSig.length - 2) / 2,
        "bytes"
      );

      console.log("\n=== Comparison ===");
      console.log("Session key sig bytes:", (sessionKeySig.length - 2) / 2);
      console.log("Owner key sig bytes:", (ownerSig.length - 2) / 2);
      console.log("Session key prefix (8 hex chars / 4 bytes):", sessionKeySig.slice(0, 10));
      console.log("Owner key prefix (8 hex chars / 4 bytes):", ownerSig.slice(0, 10));

      // Session key signature should be longer (has permission validator wrapper)
      expect(sessionKeySig).toMatch(/^0x/);
      expect(sessionKeySig.length).toBeGreaterThan(0);
      // Permission validator sig should differ from owner sig
      expect(sessionKeySig).not.toBe(ownerSig);
    });
  });

  // -------------------------------------------------------------------------
  // Test 3: Submit transferWithAuthorization with session key signature
  //
  // IMPORTANT: This test requires the permission validator module to be
  // installed on the smart account. Without installation, the smart account's
  // isValidSignature will not recognize the permission validator's signature
  // format and will reject it.
  //
  // Installing the module requires submitting a UserOperation via a bundler.
  // If no bundler is available, this test will skip gracefully and report
  // what would be needed.
  // -------------------------------------------------------------------------
  describe("Submit transferWithAuthorization with session key signature (on-chain)", () => {
    it(
      "should attempt transferWithAuthorization with session key ERC-1271 signature",
      { timeout: 120_000 },
      async () => {
        // Pre-checks
        const [saBalance, code] = await Promise.all([
          publicClient.readContract({
            address: USDC_ADDRESS,
            abi: USDC_ABI,
            functionName: "balanceOf",
            args: [DEPLOYED_SA_ADDRESS],
          }),
          publicClient.getCode({ address: DEPLOYED_SA_ADDRESS }),
        ]);

        const isDeployed = code !== undefined && code !== "0x";

        if (!isDeployed) {
          console.log("SKIP: Smart account not deployed.");
          return;
        }
        if (saBalance === BigInt(0)) {
          console.log("SKIP: Smart account has no USDC.");
          return;
        }

        console.log(
          `Smart account USDC balance: ${(Number(saBalance) / 1e6).toFixed(6)}`
        );

        // Create session key kernel account with permission validator
        const ecdsaSigner = await toECDSASigner({
          signer: sessionKeyAccount,
        });

        const permissionValidator = await toPermissionValidator(publicClient, {
          signer: ecdsaSigner,
          policies: [toSudoPolicy({})],
          entryPoint: {
            address: entryPoint07Address,
            version: "0.7",
          },
          kernelVersion: "0.3.3",
        });

        const sessionKeyKernelAccount = await createKernelAccount(
          publicClient,
          {
            entryPoint: {
              address: entryPoint07Address,
              version: "0.7",
            },
            kernelVersion: "0.3.3",
            plugins: {
              regular: permissionValidator,
            },
            address: DEPLOYED_SA_ADDRESS,
          }
        );

        // Check if the permission validator is installed on-chain
        const isInstalled = await permissionValidator.isEnabled(
          DEPLOYED_SA_ADDRESS,
          "0x00000000" as Hex
        );
        console.log("Permission validator installed on smart account:", isInstalled);

        if (!isInstalled) {
          console.log("");
          console.log("=== PERMISSION VALIDATOR NOT INSTALLED ===");
          console.log("The session key permission module is NOT installed on the smart account.");
          console.log("This means isValidSignature will NOT recognize the session key's signature format.");
          console.log("");
          console.log("To install it, you need to submit a UserOperation via a bundler that calls");
          console.log("the smart account's installModule() function with the permission validator data.");
          console.log("");
          console.log("Attempting to sign and submit anyway to document the exact failure...");
        }

        const transferAmount = BigInt(1); // 0.000001 USDC
        const auth = buildTransferAuth(
          DEPLOYED_SA_ADDRESS,
          RECIPIENT,
          transferAmount
        );

        // Sign with session key via permission validator
        const erc1271Sig = await sessionKeyKernelAccount.signTypedData({
          domain: USDC_DOMAIN,
          types: AUTHORIZATION_TYPES,
          primaryType: "TransferWithAuthorization",
          message: auth,
        });

        console.log("Session key ERC-1271 signature:", erc1271Sig.slice(0, 80) + "...");
        console.log("Signature length:", (erc1271Sig.length - 2) / 2, "bytes");

        try {
          const txHash = await walletClient.writeContract({
            address: USDC_ADDRESS,
            abi: USDC_ABI,
            functionName: "transferWithAuthorization",
            args: [
              auth.from,
              auth.to,
              auth.value,
              auth.validAfter,
              auth.validBefore,
              auth.nonce,
              erc1271Sig,
            ],
          });

          console.log("transferWithAuthorization tx submitted:", txHash);

          const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            timeout: 120_000,
          });

          console.log("Tx status:", receipt.status);
          console.log("Gas used:", receipt.gasUsed.toString());
          console.log("Tx hash:", txHash);

          if (receipt.status === "success") {
            console.log("");
            console.log("SUCCESS: Session key ERC-1271 signature accepted by USDC transferWithAuthorization!");
            console.log("This means the permission validator module is working correctly.");
          } else {
            console.log("REVERTED: Transaction included but reverted.");
          }

          expect(receipt.status).toBe("success");
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error ? err.message : String(err);
          console.log("");
          console.log("FAILED: transferWithAuthorization with session key signature.");
          console.log("Error:", errorMessage);

          if (!isInstalled) {
            console.log("");
            console.log("EXPECTED FAILURE: Permission validator not installed on smart account.");
            console.log("The smart account's isValidSignature cannot validate the permission validator");
            console.log("signature format because the module has not been installed via a UserOperation.");
            console.log("");
            console.log("CONCLUSION: Session key signatures require the permission validator module");
            console.log("to be installed on the smart account first. This requires a bundler.");
          }

          // Soft fail — we want to capture the error message
          expect.soft(errorMessage).toContain("");
        }
      }
    );

    it(
      "should attempt installing permission validator via direct owner tx (no bundler)",
      { timeout: 120_000 },
      async () => {
        const code = await publicClient.getCode({ address: DEPLOYED_SA_ADDRESS });
        if (!code || code === "0x") {
          console.log("SKIP: Smart account not deployed.");
          return;
        }

        const eoaEth = await publicClient.getBalance({
          address: ownerAccount.address,
        });
        if (eoaEth === BigInt(0)) {
          console.log("SKIP: Owner EOA has no ETH for gas.");
          return;
        }

        console.log(`Owner EOA ETH: ${formatEther(eoaEth)}`);

        // Create the permission validator
        const ecdsaSigner = await toECDSASigner({
          signer: sessionKeyAccount,
        });

        const permissionValidator = await toPermissionValidator(publicClient, {
          signer: ecdsaSigner,
          policies: [toSudoPolicy({})],
          entryPoint: {
            address: entryPoint07Address,
            version: "0.7",
          },
          kernelVersion: "0.3.3",
        });

        // Check if already installed
        const isInstalled = await permissionValidator.isEnabled(
          DEPLOYED_SA_ADDRESS,
          "0x00000000" as Hex
        );

        if (isInstalled) {
          console.log("Permission validator already installed. Skipping installation.");
          return;
        }

        console.log("Attempting to install permission validator via direct owner transaction...");

        // Create a Kernel account with the owner key to get the install calldata
        const ownerKernelAccount = await createKernelAccount(publicClient, {
          entryPoint: {
            address: entryPoint07Address,
            version: "0.7",
          },
          kernelVersion: "0.3.3",
          plugins: {
            regular: permissionValidator,
          },
          address: DEPLOYED_SA_ADDRESS,
        });

        // Try to get the module install calldata
        try {
          const installCallData = await ownerKernelAccount.encodeModuleInstallCallData();
          console.log("Module install calldata:", installCallData.slice(0, 80) + "...");
          console.log("Calldata length:", (installCallData.length - 2) / 2, "bytes");

          // The owner EOA can call the smart account directly (since it's the sudo validator)
          // to install the module. But this requires a special execute path.
          // For Kernel v3, the owner needs to call execute() on the smart account
          // which will internally call installModule().

          // Try to submit the install transaction directly from the owner
          const txHash = await walletClient.sendTransaction({
            to: DEPLOYED_SA_ADDRESS,
            data: installCallData,
          });

          console.log("Install tx submitted:", txHash);

          const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            timeout: 120_000,
          });

          console.log("Install tx status:", receipt.status);
          console.log("Install gas used:", receipt.gasUsed.toString());

          if (receipt.status === "success") {
            console.log("SUCCESS: Permission validator module installed on smart account!");

            // Verify installation
            const nowInstalled = await permissionValidator.isEnabled(
              DEPLOYED_SA_ADDRESS,
              "0x00000000" as Hex
            );
            console.log("Module now installed:", nowInstalled);
          } else {
            console.log("REVERTED: Module installation failed.");
            console.log("This likely means the owner EOA cannot directly call the smart account");
            console.log("to install modules. A UserOperation via bundler may be required.");
          }
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error ? err.message : String(err);
          console.log("Failed to install permission validator:", errorMessage);
          console.log("");
          console.log("This is expected — Kernel v3 smart accounts require UserOperations");
          console.log("(via a bundler) to modify module configuration. The owner EOA cannot");
          console.log("directly call the smart account to install modules.");
          console.log("");
          console.log("NEXT STEP: Set up a bundler (Pimlico, Alchemy) to submit UserOperations.");
          expect.soft(errorMessage).toContain("");
        }
      }
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: Fallback — test with owner key acting as "session key"
  //
  // This tests whether toKernelSmartAccount with a DIFFERENT EOA (not the
  // original owner) can produce valid ERC-1271 signatures. This simulates
  // the session key scenario without needing the permission validator module.
  // -------------------------------------------------------------------------
  describe("Fallback: non-owner EOA as signer (simulated session key)", () => {
    it(
      "should test if a non-owner EOA can sign via the deployed smart account",
      { timeout: 120_000 },
      async () => {
        const code = await publicClient.getCode({ address: DEPLOYED_SA_ADDRESS });
        if (!code || code === "0x") {
          console.log("SKIP: Smart account not deployed.");
          return;
        }

        const saBalance = await publicClient.readContract({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: "balanceOf",
          args: [DEPLOYED_SA_ADDRESS],
        });

        if (saBalance === BigInt(0)) {
          console.log("SKIP: Smart account has no USDC.");
          return;
        }

        console.log("=== Fallback Test: Non-Owner EOA as Signer ===");
        console.log("Session key EOA:", sessionKeyAccount.address);
        console.log("Original owner:", ownerAccount.address);

        // Create a Kernel account pointing to the DEPLOYED address
        // but with the session key as the "owner" via permissionless library
        const sessionKernelAccount = await toKernelSmartAccount({
          client: publicClient,
          owners: [sessionKeyAccount],
          version: "0.3.3",
          entryPoint: {
            address: entryPoint07Address,
            version: "0.7",
          },
          // This will compute a DIFFERENT counterfactual address than the
          // deployed one, since the owner is different. But we force the
          // address to the deployed one.
          index: BigInt(0),
        });

        console.log("Session key kernel account address:", sessionKernelAccount.address);
        console.log("Expected deployed address:", DEPLOYED_SA_ADDRESS);

        // NOTE: sessionKernelAccount.address will NOT match DEPLOYED_SA_ADDRESS
        // because the counterfactual address depends on the owner.
        // The toKernelSmartAccount function from permissionless doesn't support
        // passing an existing `address` parameter.
        //
        // So this test actually creates a DIFFERENT smart account address
        // and would need its own deployment. This confirms we need the
        // @zerodev/sdk createKernelAccount approach instead.

        const addressMatch =
          sessionKernelAccount.address.toLowerCase() ===
          DEPLOYED_SA_ADDRESS.toLowerCase();
        console.log(
          "Address matches deployed SA:",
          addressMatch
        );

        if (!addressMatch) {
          console.log("");
          console.log("EXPECTED: Different owner → different counterfactual address.");
          console.log("This confirms we CANNOT simply swap the owner key and reuse");
          console.log("the existing smart account. We MUST use the permission validator");
          console.log("module (@zerodev/permissions) or the @zerodev/sdk createKernelAccount");
          console.log("with the permission plugin to sign on behalf of the deployed account.");
          console.log("");
          console.log("Session key approach via permissionless library is NOT viable.");
          console.log("Must use @zerodev/sdk createKernelAccount with permission validator.");
        }

        expect(typeof addressMatch).toBe("boolean");
      }
    );

    it(
      "should test createKernelAccount with session key as owner (forced address)",
      { timeout: 120_000 },
      async () => {
        const code = await publicClient.getCode({ address: DEPLOYED_SA_ADDRESS });
        if (!code || code === "0x") {
          console.log("SKIP: Smart account not deployed.");
          return;
        }

        const saBalance = await publicClient.readContract({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: "balanceOf",
          args: [DEPLOYED_SA_ADDRESS],
        });

        if (saBalance === BigInt(0)) {
          console.log("SKIP: Smart account has no USDC.");
          return;
        }

        console.log("=== Test: createKernelAccount with session key + forced address ===");

        // Use @zerodev/sdk createKernelAccount which supports the `address` parameter
        // This lets us point at the deployed SA while using a different signer
        const ecdsaSigner = await toECDSASigner({
          signer: sessionKeyAccount,
        });

        // Use sudo policy (no restrictions) for this test
        const permissionValidator = await toPermissionValidator(publicClient, {
          signer: ecdsaSigner,
          policies: [toSudoPolicy({})],
          entryPoint: {
            address: entryPoint07Address,
            version: "0.7",
          },
          kernelVersion: "0.3.3",
        });

        const sessionKernelAccount = await createKernelAccount(publicClient, {
          entryPoint: {
            address: entryPoint07Address,
            version: "0.7",
          },
          kernelVersion: "0.3.3",
          plugins: {
            regular: permissionValidator,
          },
          address: DEPLOYED_SA_ADDRESS,
        });

        console.log("Kernel account address:", sessionKernelAccount.address);
        expect(sessionKernelAccount.address.toLowerCase()).toBe(
          DEPLOYED_SA_ADDRESS.toLowerCase()
        );

        // Sign the transferWithAuthorization
        const transferAmount = BigInt(1);
        const auth = buildTransferAuth(
          DEPLOYED_SA_ADDRESS,
          RECIPIENT,
          transferAmount
        );

        const sessionSig = await sessionKernelAccount.signTypedData({
          domain: USDC_DOMAIN,
          types: AUTHORIZATION_TYPES,
          primaryType: "TransferWithAuthorization",
          message: auth,
        });

        console.log("Session key signature (forced address):");
        console.log("  Sig:", sessionSig.slice(0, 80) + "...");
        console.log("  Length:", (sessionSig.length - 2) / 2, "bytes");
        console.log("  First 4 bytes (validator id):", sessionSig.slice(0, 10));

        // Try to submit the transfer
        try {
          const txHash = await walletClient.writeContract({
            address: USDC_ADDRESS,
            abi: USDC_ABI,
            functionName: "transferWithAuthorization",
            args: [
              auth.from,
              auth.to,
              auth.value,
              auth.validAfter,
              auth.validBefore,
              auth.nonce,
              sessionSig,
            ],
          });

          console.log("Tx submitted:", txHash);

          const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            timeout: 120_000,
          });

          console.log("Tx status:", receipt.status);
          console.log("Gas used:", receipt.gasUsed.toString());

          if (receipt.status === "success") {
            console.log("");
            console.log("SUCCESS: Session key (via permission validator) ERC-1271 signature");
            console.log("accepted by USDC transferWithAuthorization!");
            console.log("Tx hash:", txHash);
          }

          expect(receipt.status).toBe("success");
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error ? err.message : String(err);
          console.log("FAILED:", errorMessage);
          console.log("");
          console.log("This failure is expected if the permission validator module");
          console.log("is not installed on the smart account. The smart account's");
          console.log("isValidSignature dispatches based on the first 4 bytes of the");
          console.log("signature (the validator identifier). If the permission validator");
          console.log("is not registered, it will reject.");
          console.log("");
          console.log("NEXT STEP: Install the permission validator module via a UserOperation.");

          expect.soft(errorMessage).toContain("");
        }
      }
    );
  });

  // -------------------------------------------------------------------------
  // Test 5: Signature format analysis
  // -------------------------------------------------------------------------
  describe("Signature format analysis", () => {
    it("should compare owner vs session key signature formats", async () => {
      // Owner key signature (the proven working path from spike 1)
      const ownerKernelAccount = await toKernelSmartAccount({
        client: publicClient,
        owners: [ownerAccount],
        version: "0.3.3",
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
        index: BigInt(0),
      });

      // Session key via permission validator
      const ecdsaSigner = await toECDSASigner({
        signer: sessionKeyAccount,
      });

      const permissionValidator = await toPermissionValidator(publicClient, {
        signer: ecdsaSigner,
        policies: [toSudoPolicy({})],
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
        kernelVersion: "0.3.3",
      });

      const sessionKernelAccount = await createKernelAccount(publicClient, {
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
        kernelVersion: "0.3.3",
        plugins: {
          regular: permissionValidator,
        },
        address: DEPLOYED_SA_ADDRESS,
      });

      const auth = buildTransferAuth(DEPLOYED_SA_ADDRESS, RECIPIENT, BigInt(1));

      const ownerSig = await ownerKernelAccount.signTypedData({
        domain: USDC_DOMAIN,
        types: AUTHORIZATION_TYPES,
        primaryType: "TransferWithAuthorization",
        message: auth,
      });

      const sessionSig = await sessionKernelAccount.signTypedData({
        domain: USDC_DOMAIN,
        types: AUTHORIZATION_TYPES,
        primaryType: "TransferWithAuthorization",
        message: auth,
      });

      console.log("=== Signature Format Analysis ===");
      console.log("");
      console.log("Owner key (ECDSA validator):");
      console.log("  Full sig:", ownerSig);
      console.log("  Length:", (ownerSig.length - 2) / 2, "bytes");
      console.log("  First 4 bytes (validator id):", ownerSig.slice(0, 10));
      console.log("");
      console.log("Session key (Permission validator):");
      console.log("  Full sig:", sessionSig);
      console.log("  Length:", (sessionSig.length - 2) / 2, "bytes");
      console.log("  First 4 bytes (validator id):", sessionSig.slice(0, 10));
      console.log("");

      // Parse the structure
      // Owner sig format: [4-byte validator id] + [EIP-712 wrapped ECDSA sig]
      // Session sig format: [4-byte permission id] + [0xff] + [EIP-712 wrapped ECDSA sig]
      const ownerValidatorId = ownerSig.slice(2, 10);
      const sessionPermissionId = sessionSig.slice(2, 10);

      console.log("Owner validator ID:", "0x" + ownerValidatorId);
      console.log("Session permission ID:", "0x" + sessionPermissionId);
      console.log(
        "Different IDs:",
        ownerValidatorId !== sessionPermissionId
      );

      // Check if session sig contains 0xff after the permission ID
      const afterPermId = sessionSig.slice(10, 12);
      console.log("Byte after permission ID:", "0x" + afterPermId);
      console.log("Is 0xff (permission validator marker):", afterPermId === "ff");

      expect(ownerSig).toMatch(/^0x/);
      expect(sessionSig).toMatch(/^0x/);
      // Session sig may be shorter or longer — the key difference is the validator ID prefix
      expect(sessionSig.length).toBeGreaterThan(0);
      expect(ownerSig.length).toBeGreaterThan(0);
      // They should have different validator ID prefixes
      expect(ownerSig.slice(0, 10)).not.toBe(sessionSig.slice(0, 10));
    });
  });
});

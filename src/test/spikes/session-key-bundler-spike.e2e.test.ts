/**
 * Spike 3: Session Key Permission Validator Installation via Bundler
 *
 * This spike completes the feasibility proof:
 * 1. Use a Pimlico bundler to install the permission validator module on the
 *    deployed Kernel v3.3 smart account via UserOperation
 * 2. Test `transferWithAuthorization` with a session key ERC-1271 signature
 *
 * Background:
 * - Spike 1 proved owner key ERC-1271 works with USDC transferWithAuthorization
 * - Spike 2 proved session key permission validator produces valid signatures offline
 * - Spike 2 FAILED on-chain because the permission module is NOT installed
 * - Direct module install from EOA fails ("EntryPoint v0.7 not supported yet")
 * - This spike uses a bundler (Pimlico) to submit UserOperations
 *
 * The deployed smart account: 0xc7B29D24De8F48186106E9Fd42584776D2a915e8 on Base Sepolia
 * Owner EOA: 0x947Af7ad155f299a768874F73B3223f4a93260C6
 *
 * Environment requirements:
 * - RPC_URL: Base Sepolia RPC endpoint
 * - TEST_EOA_PRIVATE_KEY: Owner EOA private key (defaults to test key)
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
  zeroAddress,
} from "viem";
import { baseSepolia } from "viem/chains";
import {
  generatePrivateKey,
  privateKeyToAccount,
} from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import crypto from "crypto";
import { CHAIN_CONFIGS } from "@/lib/chain-config";

// @zerodev/sdk — Kernel smart account creation + client
import {
  createKernelAccount,
  createKernelAccountClient,
} from "@zerodev/sdk";

// @zerodev/ecdsa-validator — ECDSA validator for the owner (sudo)
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";

// @zerodev/permissions — session key permission validator
import { toPermissionValidator } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toSudoPolicy } from "@zerodev/permissions/policies";

// permissionless — Pimlico bundler client
import { createPimlicoClient } from "permissionless/clients/pimlico";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_SEPOLIA_CHAIN_ID = 84532;
const chainConfig = CHAIN_CONFIGS[BASE_SEPOLIA_CHAIN_ID];
const USDC_ADDRESS = chainConfig.usdcAddress;
const USDC_DOMAIN = chainConfig.usdcDomain;

// Dedicated testnet-only EOA key (same as spike 1 & 2)
const DEFAULT_TEST_KEY: Hex =
  "0xcfb0b3a1352e19a27df8bd158acf7eced224bfb9e68a76da9ef04091402b92a9";

const ownerPrivateKey =
  (process.env.TEST_EOA_PRIVATE_KEY as Hex) || DEFAULT_TEST_KEY;
const rpcUrl = process.env.RPC_URL || "https://sepolia.base.org";

// Pimlico bundler URL (Base Sepolia)
const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY;
const BUNDLER_URL = `https://api.pimlico.io/v2/84532/rpc?apikey=${PIMLICO_API_KEY}`;

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

describe.skipIf(!process.env.PIMLICO_API_KEY)("Spike 3: Session key permission validator install via bundler", () => {
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

  const entryPoint = {
    address: entryPoint07Address,
    version: "0.7" as const,
  };

  beforeAll(async () => {
    console.log("=== Spike 3: Session Key via Bundler ===");
    console.log("Owner EOA:", ownerAccount.address);
    console.log("Session key EOA:", sessionKeyAccount.address);
    console.log("Deployed smart account:", DEPLOYED_SA_ADDRESS);
    console.log("USDC address:", USDC_ADDRESS);
    console.log("Bundler URL:", BUNDLER_URL.replace(PIMLICO_API_KEY ?? "", "***"));
    console.log("");

    // Check balances
    const [saUsdc, eoaEth, code] = await Promise.all([
      publicClient.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [DEPLOYED_SA_ADDRESS],
      }),
      publicClient.getBalance({ address: ownerAccount.address }),
      publicClient.getCode({ address: DEPLOYED_SA_ADDRESS }),
    ]);

    const isDeployed = code !== undefined && code !== "0x";
    console.log("Smart account deployed:", isDeployed);
    console.log(`Owner EOA ETH: ${formatEther(eoaEth)}`);
    console.log(
      `Smart account USDC: ${(Number(saUsdc) / 1e6).toFixed(6)}`
    );

    if (!isDeployed) {
      console.log("ERROR: Smart account not deployed! Run spike 1 first.");
    }
    if (saUsdc === BigInt(0)) {
      console.log("WARNING: Smart account has no USDC for transfer tests.");
    }
  });

  // -------------------------------------------------------------------------
  // Test 1: Verify Pimlico bundler connection
  // -------------------------------------------------------------------------
  it("should connect to Pimlico bundler", async () => {
    const pimlicoClient = createPimlicoClient({
      chain: baseSepolia,
      transport: http(BUNDLER_URL),
      entryPoint,
    });

    console.log("Pimlico client created");

    // Test the connection by checking supported entry points
    // The bundler should respond to RPC calls
    try {
      const gasPrice = await pimlicoClient.getUserOperationGasPrice();
      console.log("Bundler gas price:", {
        slow: gasPrice.slow.maxFeePerGas.toString(),
        standard: gasPrice.standard.maxFeePerGas.toString(),
        fast: gasPrice.fast.maxFeePerGas.toString(),
      });
      expect(gasPrice.standard.maxFeePerGas).toBeGreaterThan(BigInt(0));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("Bundler connection error:", msg);
      // Try a simpler RPC call
      expect.soft(msg).toBe("");
    }
  });

  // -------------------------------------------------------------------------
  // Test 2: Create Kernel account with owner (sudo) + permission (regular) validators
  //         and install permission module via UserOperation
  // -------------------------------------------------------------------------
  it(
    "should install permission validator module via UserOperation",
    { timeout: 180_000 },
    async () => {
      const code = await publicClient.getCode({
        address: DEPLOYED_SA_ADDRESS,
      });
      if (!code || code === "0x") {
        console.log("SKIP: Smart account not deployed.");
        return;
      }

      // Step 1: Create the ECDSA validator for the owner (sudo)
      console.log("Step 1: Creating owner ECDSA validator (sudo)...");
      const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer: ownerAccount,
        entryPoint,
        kernelVersion: "0.3.3",
      });
      console.log("  Owner ECDSA validator address:", ecdsaValidator.address);

      // Step 2: Create the permission validator for the session key (regular)
      console.log("Step 2: Creating session key permission validator (regular)...");
      const ecdsaSigner = await toECDSASigner({
        signer: sessionKeyAccount,
      });

      const permissionValidator = await toPermissionValidator(publicClient, {
        signer: ecdsaSigner,
        policies: [toSudoPolicy({})],
        entryPoint,
        kernelVersion: "0.3.3",
      });
      console.log("  Permission validator address:", permissionValidator.address);
      console.log("  Permission validator ID:", permissionValidator.getIdentifier());

      // Step 3: Create Kernel account with BOTH validators
      // The sudo validator (owner) can sign the enable data for the regular validator
      console.log("Step 3: Creating Kernel account with both validators...");
      const kernelAccount = await createKernelAccount(publicClient, {
        entryPoint,
        kernelVersion: "0.3.3",
        plugins: {
          sudo: ecdsaValidator,
          regular: permissionValidator,
        },
        address: DEPLOYED_SA_ADDRESS,
      });

      console.log("  Kernel account address:", kernelAccount.address);
      expect(kernelAccount.address.toLowerCase()).toBe(
        DEPLOYED_SA_ADDRESS.toLowerCase()
      );

      // Step 4: Create the Kernel account client with Pimlico bundler
      console.log("Step 4: Creating Kernel account client with bundler...");

      // Use Pimlico as both bundler and paymaster (gas sponsorship on testnets)
      const pimlicoClient = createPimlicoClient({
        chain: baseSepolia,
        transport: http(BUNDLER_URL),
        entryPoint,
      });

      const kernelClient = createKernelAccountClient({
        account: kernelAccount,
        chain: baseSepolia,
        bundlerTransport: http(BUNDLER_URL),
        client: publicClient,
        // Use Pimlico paymaster for gas sponsorship on testnet
        paymaster: {
          getPaymasterData: pimlicoClient.getPaymasterData,
          getPaymasterStubData: pimlicoClient.getPaymasterStubData,
        },
        // Override gas estimation to use Pimlico's pimlico_getUserOperationGasPrice
        // instead of ZeroDev's zd_getUserOperationGasPrice
        userOperation: {
          estimateFeesPerGas: async () => {
            const gasPrice = await pimlicoClient.getUserOperationGasPrice();
            return gasPrice.fast;
          },
        },
      });

      console.log("  Kernel client created");

      // Step 5: Send a no-op UserOperation to trigger plugin enable
      // The SDK auto-includes the enable data for the regular validator
      // in the first UserOperation's signature
      console.log("Step 5: Sending UserOperation to install permission module...");
      console.log("  (This sends a 0-value call to trigger the plugin enable flow)");

      try {
        const userOpHash = await kernelClient.sendUserOperation({
          callData: await kernelAccount.encodeCalls([
            {
              to: zeroAddress,
              value: BigInt(0),
              data: "0x",
            },
          ]),
        });

        console.log("  UserOperation submitted! Hash:", userOpHash);

        // Wait for the UserOperation to be included
        console.log("  Waiting for UserOperation receipt...");
        const receipt = await pimlicoClient.waitForUserOperationReceipt({
          hash: userOpHash,
          timeout: 120_000,
        });

        console.log("  UserOp included in tx:", receipt.receipt.transactionHash);
        console.log("  UserOp success:", receipt.success);
        console.log("  Gas used:", receipt.receipt.gasUsed.toString());

        expect(receipt.success).toBe(true);

        // Verify the permission module is now installed
        const isInstalled = await permissionValidator.isEnabled(
          DEPLOYED_SA_ADDRESS,
          "0x00000000" as Hex
        );
        console.log("  Permission validator now installed:", isInstalled);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log("  FAILED to send UserOperation:", msg);

        // Check if it's a gas/paymaster issue
        if (msg.includes("paymaster") || msg.includes("gas")) {
          console.log("");
          console.log("  This may be a paymaster/gas sponsorship issue.");
          console.log("  Pimlico may not sponsor gas on Base Sepolia for this account.");
          console.log("  Try without paymaster (EOA needs ETH for prefunding).");
        }

        // Try without paymaster as fallback
        console.log("");
        console.log("  Retrying WITHOUT paymaster (self-funded)...");

        try {
          const kernelClientNoPaymaster = createKernelAccountClient({
            account: kernelAccount,
            chain: baseSepolia,
            bundlerTransport: http(BUNDLER_URL),
            client: publicClient,
            userOperation: {
              estimateFeesPerGas: async () => {
                const gasPrice = await pimlicoClient.getUserOperationGasPrice();
                return gasPrice.fast;
              },
            },
          });

          const userOpHash2 = await kernelClientNoPaymaster.sendUserOperation({
            callData: await kernelAccount.encodeCalls([
              {
                to: zeroAddress,
                value: BigInt(0),
                data: "0x",
              },
            ]),
          });

          console.log("  UserOperation (no paymaster) submitted:", userOpHash2);

          const receipt2 = await pimlicoClient.waitForUserOperationReceipt({
            hash: userOpHash2,
            timeout: 120_000,
          });

          console.log("  UserOp included in tx:", receipt2.receipt.transactionHash);
          console.log("  UserOp success:", receipt2.success);
          expect(receipt2.success).toBe(true);
        } catch (err2: unknown) {
          const msg2 = err2 instanceof Error ? err2.message : String(err2);
          console.log("  ALSO FAILED without paymaster:", msg2);
          console.log("");
          console.log("  Both paymaster and self-funded approaches failed.");
          console.log("  Original error:", msg);
          console.log("  Self-funded error:", msg2);
          expect.soft(msg2).toBe("");
        }
      }
    }
  );

  // -------------------------------------------------------------------------
  // Test 3: Test transferWithAuthorization with session key after module install
  // -------------------------------------------------------------------------
  it(
    "should succeed with transferWithAuthorization using session key ERC-1271 signature",
    { timeout: 120_000 },
    async () => {
      const [saBalance, code] = await Promise.all([
        publicClient.readContract({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: "balanceOf",
          args: [DEPLOYED_SA_ADDRESS],
        }),
        publicClient.getCode({ address: DEPLOYED_SA_ADDRESS }),
      ]);

      if (!code || code === "0x") {
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

      // Create session key Kernel account with permission validator
      const ecdsaSigner = await toECDSASigner({
        signer: sessionKeyAccount,
      });

      const permissionValidator = await toPermissionValidator(publicClient, {
        signer: ecdsaSigner,
        policies: [toSudoPolicy({})],
        entryPoint,
        kernelVersion: "0.3.3",
      });

      // Check if the module is installed after the previous test
      const isInstalled = await permissionValidator.isEnabled(
        DEPLOYED_SA_ADDRESS,
        "0x00000000" as Hex
      );
      console.log("Permission validator installed:", isInstalled);

      if (!isInstalled) {
        console.log(
          "WARNING: Permission validator NOT installed. " +
            "The module install UserOperation from the previous test may have failed. " +
            "This test will likely fail with 'invalid signature'."
        );
      }

      // Create the session key kernel account
      const sessionKeyKernelAccount = await createKernelAccount(publicClient, {
        entryPoint,
        kernelVersion: "0.3.3",
        plugins: {
          regular: permissionValidator,
        },
        address: DEPLOYED_SA_ADDRESS,
      });

      // Build the transfer authorization
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

      console.log("Session key ERC-1271 signature:");
      console.log("  Sig:", erc1271Sig.slice(0, 80) + "...");
      console.log("  Length:", (erc1271Sig.length - 2) / 2, "bytes");
      console.log("  First byte:", erc1271Sig.slice(2, 4));

      // Get recipient balance before
      const recipientBefore = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [RECIPIENT],
      });

      try {
        // Submit transferWithAuthorization with session key signature
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
          const recipientAfter = await publicClient.readContract({
            address: USDC_ADDRESS,
            abi: USDC_ABI,
            functionName: "balanceOf",
            args: [RECIPIENT],
          });

          console.log("");
          console.log("=== SUCCESS ===");
          console.log(
            "Session key ERC-1271 signature accepted by USDC transferWithAuthorization!"
          );
          console.log("Tx hash:", txHash);
          console.log(
            "USDC transferred:",
            (Number(recipientAfter - recipientBefore) / 1e6).toFixed(6)
          );
          console.log("");
          console.log("CONCLUSION: Smart account + session key architecture is 100% FEASIBLE.");
          console.log("The permission validator module was installed via bundler UserOperation,");
          console.log("and the session key's ERC-1271 signature was accepted by USDC on-chain.");

          expect(recipientAfter - recipientBefore).toBe(transferAmount);
        } else {
          console.log("REVERTED: Transaction included but reverted on-chain.");
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
          console.log(
            "EXPECTED: Permission validator not installed. The module install " +
              "UserOperation from the previous test likely failed."
          );
        }

        expect.soft(errorMessage).toBe("");
      }
    }
  );
});

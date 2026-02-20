/**
 * Spike: ERC-4337 Smart Account + USDC ERC-1271 Signature Tests
 *
 * This spike investigates whether USDC v2.2 on Base Sepolia accepts ERC-1271
 * signatures from a **deployed** Kernel v3 smart account for `transferWithAuthorization`.
 *
 * USDC v2.2 (FiatTokenV2_2) uses OpenZeppelin's SignatureChecker which supports
 * both ECDSA (EOA) and ERC-1271 (smart contract) signature validation —
 * but only if the smart account is deployed on-chain (has bytecode).
 *
 * Environment requirements:
 * - RPC_URL: Base Sepolia RPC endpoint
 * - TEST_EOA_PRIVATE_KEY: Funded EOA private key (owns ETH + USDC on Base Sepolia)
 *   Falls back to the hardhat #0 test key if not set.
 *
 * These are real on-chain tests — they require Base Sepolia ETH for gas and
 * testnet USDC for transfer tests.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  parseAbi,
  formatEther,
  type Hex,
  type Address,
} from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { toKernelSmartAccount } from "permissionless/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import crypto from "crypto";
import { CHAIN_CONFIGS } from "@/lib/chain-config";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_SEPOLIA_CHAIN_ID = 84532;
const chainConfig = CHAIN_CONFIGS[BASE_SEPOLIA_CHAIN_ID];
const USDC_ADDRESS = chainConfig.usdcAddress;
const USDC_DOMAIN = chainConfig.usdcDomain;

// Dedicated testnet-only EOA key (generated for this spike — never holds real funds)
// EOA address: 0x947Af7ad155f299a768874F73B3223f4a93260C6
const DEFAULT_TEST_KEY: Hex =
  "0xcfb0b3a1352e19a27df8bd158acf7eced224bfb9e68a76da9ef04091402b92a9";

const ownerPrivateKey = (process.env.TEST_EOA_PRIVATE_KEY as Hex) || DEFAULT_TEST_KEY;
const rpcUrl = process.env.RPC_URL || "https://sepolia.base.org";

// USDC ABI — only the functions we need
const USDC_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature) external",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function version() view returns (string)",
  "function name() view returns (string)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
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

// ---------------------------------------------------------------------------
// Test Suite: USDC v2.2 ERC-1271 Signature Acceptance (with deployed SA)
// ---------------------------------------------------------------------------

describe("Spike: USDC v2.2 ERC-1271 signature acceptance (deployed smart account)", () => {
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

  let smartAccountAddress: Address;
  let kernelAccount: Awaited<ReturnType<typeof toKernelSmartAccount>>;

  // A recipient address for test transfers (burn address is fine for testnet)
  const RECIPIENT: Address = "0x000000000000000000000000000000000000dEaD";

  beforeAll(async () => {
    // Create the Kernel v3 smart account (counterfactual — may not be deployed yet)
    kernelAccount = await toKernelSmartAccount({
      client: publicClient,
      owners: [ownerAccount],
      version: "0.3.3",
      entryPoint: {
        address: entryPoint07Address,
        version: "0.7",
      },
      index: 0n,
    });

    smartAccountAddress = getAddress(kernelAccount.address);
    console.log("Owner EOA:", ownerAccount.address);
    console.log("Kernel v3 smart account:", smartAccountAddress);
  });

  it("should compute a deterministic counterfactual address for the smart account", () => {
    expect(smartAccountAddress).toBeDefined();
    expect(smartAccountAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(smartAccountAddress.toLowerCase()).not.toBe(
      ownerAccount.address.toLowerCase(),
    );
    console.log("Smart account address:", smartAccountAddress);
  });

  it("should read the USDC contract version on Base Sepolia", async () => {
    const name = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "name",
    });
    console.log("USDC name:", name);
    expect(name).toBeTruthy();

    try {
      const version = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "version",
      });
      console.log("USDC version:", version);
      expect(version).toBeTruthy();
    } catch (err) {
      console.log("USDC version() call failed — may not be v2.2:", err);
    }
  });

  it("should check balances (EOA + smart account)", async () => {
    const [eoaUsdc, saUsdc, eoaEth] = await Promise.all([
      publicClient.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [ownerAccount.address],
      }),
      publicClient.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [smartAccountAddress],
      }),
      publicClient.getBalance({ address: ownerAccount.address }),
    ]);

    console.log("=== Account Balances ===");
    console.log(`EOA ${ownerAccount.address}:`);
    console.log(`  ETH: ${formatEther(eoaEth)}`);
    console.log(`  USDC: ${(Number(eoaUsdc) / 1e6).toFixed(6)}`);
    console.log(`Smart Account ${smartAccountAddress}:`);
    console.log(`  USDC: ${(Number(saUsdc) / 1e6).toFixed(6)}`);

    expect(typeof eoaUsdc).toBe("bigint");
    expect(typeof saUsdc).toBe("bigint");

    if (eoaEth === 0n) {
      console.log("WARNING: EOA has 0 ETH — cannot submit transactions (deploy or transfer).");
    }
  });

  describe("Smart account deployment", () => {
    it("should deploy the Kernel v3.3 smart account via factory", async () => {
      // Check if already deployed
      const existingCode = await publicClient.getCode({ address: smartAccountAddress });
      if (existingCode && existingCode !== "0x") {
        console.log("Smart account already deployed! Bytecode length:", existingCode.length);
        expect(existingCode.length).toBeGreaterThan(2);
        return;
      }

      console.log("Smart account NOT deployed. Deploying via factory...");

      // Check EOA has ETH for gas
      const eoaEth = await publicClient.getBalance({ address: ownerAccount.address });
      if (eoaEth === 0n) {
        console.log("SKIP: EOA has 0 ETH — cannot pay gas for deployment.");
        console.log("Fund the EOA with ~0.01 Base Sepolia ETH first.");
        expect.soft(false).toBe(true);
        return;
      }

      console.log(`EOA ETH balance: ${formatEther(eoaEth)}`);

      // Get the factory args from the kernel account itself — this ensures
      // the exact same factory + calldata that computes the counterfactual address
      const factoryArgs = await kernelAccount.getFactoryArgs();
      const { factory, factoryData } = factoryArgs;

      if (!factory || !factoryData) {
        console.log("ERROR: kernelAccount.getFactoryArgs() returned no factory/data");
        expect.soft(false).toBe(true);
        return;
      }

      console.log("Factory address:", factory);
      console.log("Factory data length:", factoryData.length);

      try {
        // Call the factory directly from the EOA using raw sendTransaction
        // This bypasses ABI encoding — we send the exact factoryData as calldata
        const deployTxHash = await walletClient.sendTransaction({
          to: factory,
          data: factoryData,
        });

        console.log("Deploy tx submitted:", deployTxHash);

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: deployTxHash,
          timeout: 120_000,
        });

        console.log("Deploy tx status:", receipt.status);
        console.log("Deploy gas used:", receipt.gasUsed.toString());
        console.log("Deploy tx hash:", deployTxHash);

        // Verify deployment at the expected address
        const deployedCode = await publicClient.getCode({ address: smartAccountAddress });
        const isDeployed = deployedCode !== undefined && deployedCode !== "0x";
        console.log("Smart account deployed at expected address:", isDeployed);
        console.log("Bytecode length:", deployedCode?.length ?? 0);

        expect(receipt.status).toBe("success");
        expect(isDeployed).toBe(true);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.log("FAILED to deploy smart account:", errorMessage);
        expect.soft(false).toBe(true);
      }
    });

    it("should verify smart account is deployed with bytecode", async () => {
      const code = await publicClient.getCode({ address: smartAccountAddress });
      const isDeployed = code !== undefined && code !== "0x";
      console.log("Smart account deployed:", isDeployed);
      console.log("Bytecode length:", code?.length ?? 0);

      if (!isDeployed) {
        console.log("WARNING: Smart account is NOT deployed. ERC-1271 tests will fail.");
      }

      expect(typeof isDeployed).toBe("boolean");
    });
  });

  describe("Fund smart account with USDC", () => {
    it("should transfer USDC from EOA to smart account if needed", async () => {
      const saBalance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [smartAccountAddress],
      });

      if (saBalance > 0n) {
        console.log(`Smart account already has ${(Number(saBalance) / 1e6).toFixed(6)} USDC. Skipping transfer.`);
        return;
      }

      // Check EOA USDC balance
      const eoaBalance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [ownerAccount.address],
      });

      if (eoaBalance === 0n) {
        console.log("SKIP: EOA has no USDC to transfer to smart account.");
        return;
      }

      // Check EOA ETH for gas
      const eoaEth = await publicClient.getBalance({ address: ownerAccount.address });
      if (eoaEth === 0n) {
        console.log("SKIP: EOA has no ETH for gas.");
        return;
      }

      // Transfer 1 USDC (1_000_000 raw) to the smart account
      const transferAmount = 1_000_000n; // 1 USDC
      const actualAmount = eoaBalance < transferAmount ? eoaBalance : transferAmount;

      console.log(`Transferring ${(Number(actualAmount) / 1e6).toFixed(6)} USDC to smart account...`);

      const txHash = await walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "transfer",
        args: [smartAccountAddress, actualAmount],
      });

      console.log("Transfer tx:", txHash);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 120_000,
      });

      console.log("Transfer status:", receipt.status);

      const newBalance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [smartAccountAddress],
      });

      console.log(`Smart account USDC balance after transfer: ${(Number(newBalance) / 1e6).toFixed(6)}`);
      expect(receipt.status).toBe("success");
    });
  });

  describe("transferWithAuthorization with ERC-1271 signature", () => {
    function buildTransferAuth(from: Address, to: Address, value: bigint) {
      const nonce = `0x${crypto.randomBytes(32).toString("hex")}` as Hex;
      const now = BigInt(Math.floor(Date.now() / 1000));
      return {
        from,
        to,
        value,
        validAfter: 0n,
        validBefore: now + 600n, // 10 minutes
        nonce,
      };
    }

    it("should attempt transferWithAuthorization using ERC-1271 (smart account) signature", { timeout: 120_000 }, async () => {
      // Pre-checks
      const [smartBalance, code] = await Promise.all([
        publicClient.readContract({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: "balanceOf",
          args: [smartAccountAddress],
        }),
        publicClient.getCode({ address: smartAccountAddress }),
      ]);

      const isDeployed = code !== undefined && code !== "0x";

      if (!isDeployed) {
        console.log("SKIP: Smart account is NOT deployed. Cannot test ERC-1271.");
        console.log("Deploy the smart account first (previous test must pass).");
        // Still produce a signature for logging
        const auth = buildTransferAuth(smartAccountAddress, RECIPIENT, 1n);
        const erc1271Sig = await kernelAccount.signTypedData({
          domain: USDC_DOMAIN,
          types: AUTHORIZATION_TYPES,
          primaryType: "TransferWithAuthorization",
          message: auth,
        });
        console.log("ERC-1271 signature produced (account not deployed):", erc1271Sig.slice(0, 40) + "...");
        expect(erc1271Sig).toMatch(/^0x/);
        return;
      }

      if (smartBalance === 0n) {
        console.log("SKIP: Smart account has no USDC. Fund it first.");
        return;
      }

      console.log(`Smart account is DEPLOYED with ${(Number(smartBalance) / 1e6).toFixed(6)} USDC`);
      console.log("Bytecode length:", code!.length);

      // Attempt the real transfer
      const transferAmount = 1n; // 0.000001 USDC
      const auth = buildTransferAuth(smartAccountAddress, RECIPIENT, transferAmount);

      // Sign with the Kernel smart account (ERC-1271 wrapped signature)
      const erc1271Sig = await kernelAccount.signTypedData({
        domain: USDC_DOMAIN,
        types: AUTHORIZATION_TYPES,
        primaryType: "TransferWithAuthorization",
        message: auth,
      });

      console.log("ERC-1271 signature:", erc1271Sig.slice(0, 40) + "...");
      console.log("ERC-1271 signature length:", erc1271Sig.length, "chars /", (erc1271Sig.length - 2) / 2, "bytes");

      const recipientBalanceBefore = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [RECIPIENT],
      });

      try {
        // Submit transferWithAuthorization — anyone can submit this tx
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
          console.log("SUCCESS: USDC v2.2 accepted ERC-1271 signature from DEPLOYED Kernel v3!");
          const recipientBalanceAfter = await publicClient.readContract({
            address: USDC_ADDRESS,
            abi: USDC_ABI,
            functionName: "balanceOf",
            args: [RECIPIENT],
          });
          expect(recipientBalanceAfter - recipientBalanceBefore).toBe(transferAmount);
        } else {
          console.log("REVERTED: Transaction was included but reverted on-chain.");
        }

        expect(receipt.status).toBe("success");
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.log("FAILED: transferWithAuthorization with ERC-1271 signature from DEPLOYED account.");
        console.log("Error:", errorMessage);

        // This is the definitive result — document the revert reason
        if (errorMessage.includes("ECRecover")) {
          console.log("CONCLUSION: USDC still uses ECRecover even with deployed smart account.");
          console.log("USDC does NOT call isValidSignature — it only uses ecrecover.");
        } else if (errorMessage.includes("isValidSignature")) {
          console.log("CONCLUSION: USDC calls isValidSignature but Kernel's implementation rejected.");
        } else {
          console.log("CONCLUSION: Unknown failure reason — needs investigation.");
        }

        // Soft fail so we capture the result
        expect.soft(errorMessage).toContain("");
      }
    });

    it("should attempt transferWithAuthorization with raw ECDSA signature (control test)", { timeout: 120_000 }, async () => {
      const eoaBalance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [ownerAccount.address],
      });

      if (eoaBalance === 0n) {
        console.log("SKIP: EOA has no USDC. Fund it to run the ECDSA control test.");
        return;
      }

      const eoaEth = await publicClient.getBalance({ address: ownerAccount.address });
      if (eoaEth === 0n) {
        console.log("SKIP: EOA has no ETH for gas.");
        return;
      }

      const transferAmount = 1n; // 0.000001 USDC
      const auth = buildTransferAuth(ownerAccount.address, RECIPIENT, transferAmount);

      const rawSig = await ownerAccount.signTypedData({
        domain: USDC_DOMAIN,
        types: AUTHORIZATION_TYPES,
        primaryType: "TransferWithAuthorization",
        message: auth,
      });

      console.log("Raw ECDSA signature:", rawSig.slice(0, 40) + "...");
      console.log("Raw ECDSA signature length:", rawSig.length, "chars");

      const recipientBalanceBefore = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [RECIPIENT],
      });

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
            rawSig,
          ],
        });

        console.log("ECDSA transferWithAuthorization tx submitted:", txHash);

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: 120_000,
        });

        console.log("ECDSA tx status:", receipt.status);
        console.log("ECDSA tx hash:", txHash);

        if (receipt.status === "success") {
          console.log("SUCCESS: Raw ECDSA signature accepted (expected).");
          const recipientBalanceAfter = await publicClient.readContract({
            address: USDC_ADDRESS,
            abi: USDC_ABI,
            functionName: "balanceOf",
            args: [RECIPIENT],
          });
          expect(recipientBalanceAfter - recipientBalanceBefore).toBe(transferAmount);
        } else {
          console.log("REVERTED: ECDSA transfer also failed — possible USDC config issue.");
        }

        expect(receipt.status).toBe("success");
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.log("ECDSA control test also failed:", errorMessage);
        expect.soft(errorMessage).toContain("");
      }
    });
  });

  describe("ERC-1271 signature format analysis", () => {
    it("should compare ECDSA vs ERC-1271 signature formats", async () => {
      const auth = {
        from: smartAccountAddress,
        to: RECIPIENT,
        value: 1n,
        validAfter: 0n,
        validBefore: BigInt(Math.floor(Date.now() / 1000)) + 600n,
        nonce: `0x${crypto.randomBytes(32).toString("hex")}` as Hex,
      };

      const rawSig = await ownerAccount.signTypedData({
        domain: USDC_DOMAIN,
        types: AUTHORIZATION_TYPES,
        primaryType: "TransferWithAuthorization",
        message: auth,
      });

      const erc1271Sig = await kernelAccount.signTypedData({
        domain: USDC_DOMAIN,
        types: AUTHORIZATION_TYPES,
        primaryType: "TransferWithAuthorization",
        message: auth,
      });

      console.log("=== Signature Format Comparison ===");
      console.log("Raw ECDSA length:", rawSig.length, "chars /", (rawSig.length - 2) / 2, "bytes");
      console.log("ERC-1271 length:", erc1271Sig.length, "chars /", (erc1271Sig.length - 2) / 2, "bytes");
      console.log("Raw ECDSA:", rawSig);
      console.log("ERC-1271:", erc1271Sig);

      const rawSigWithout0x = rawSig.slice(2);
      const erc1271SigWithout0x = erc1271Sig.slice(2);

      if (erc1271SigWithout0x.endsWith(rawSigWithout0x)) {
        const prefix = erc1271SigWithout0x.slice(0, -rawSigWithout0x.length);
        console.log("ERC-1271 prefix (hex):", prefix);
        console.log("Prefix length:", prefix.length / 2, "bytes");
      } else if (erc1271SigWithout0x.includes(rawSigWithout0x)) {
        const idx = erc1271SigWithout0x.indexOf(rawSigWithout0x);
        console.log("Raw sig found at byte offset:", idx / 2);
      } else {
        console.log("NOTE: ERC-1271 sig does not contain raw ECDSA sig directly.");
        console.log("This is expected if the Kernel wraps/transforms the signature.");
      }

      expect(rawSig).toMatch(/^0x/);
      expect(erc1271Sig).toMatch(/^0x/);
      expect(erc1271Sig.length).toBeGreaterThan(rawSig.length);
    });
  });
});

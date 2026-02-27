import { NextRequest, NextResponse } from "next/server";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  http,
  zeroAddress,
  type Hex,
  type Address,
} from "viem";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  toPermissionValidator,
  serializePermissionAccount,
} from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import {
  ENTRY_POINT,
  KERNEL_VERSION,
  buildSessionKeyPolicies,
} from "@/lib/smart-account-policies";
import {
  getChainById,
  getZeroDevBundlerRpc,
  getUsdcGasTokenAddress,
} from "@/lib/chain-config";
import { decryptPrivateKey, encryptPrivateKey } from "@/lib/encryption";
import {
  getSmartAccountWithSessionKey,
  storeSerializedAccount,
  activateSessionKey,
} from "@/lib/data/smart-account";
import { getAuthenticatedUser } from "@/lib/auth";

/**
 * Test-only endpoint that performs session key authorization server-side,
 * bypassing MetaMask/wagmi wallet signing. Uses the authenticated session
 * for user scoping and the provided seed phrase for the owner signature.
 *
 * Only available when NEXT_PUBLIC_TEST_MODE=true.
 */
export async function POST(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_TEST_MODE !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { seedPhrase, chainId } = await req.json();

  if (!seedPhrase || !chainId) {
    return NextResponse.json(
      { error: "seedPhrase and chainId required" },
      { status: 400 },
    );
  }

  try {
    const ownerAccount = mnemonicToAccount(seedPhrase as string);

    const smartAccount = await getSmartAccountWithSessionKey(
      auth.userId,
      chainId,
    );
    if (!smartAccount) {
      return NextResponse.json(
        { error: "Smart account not found" },
        { status: 404 },
      );
    }
    if (smartAccount.sessionKeyStatus === "active") {
      return NextResponse.json({
        success: true,
        alreadyActive: true,
      });
    }
    if (smartAccount.sessionKeyStatus !== "pending_grant") {
      return NextResponse.json(
        { error: `Cannot authorize — status: ${smartAccount.sessionKeyStatus}` },
        { status: 400 },
      );
    }

    const sessionKeyHex = decryptPrivateKey(smartAccount.sessionKeyEncrypted);

    const config = getChainById(chainId);
    if (!config) {
      return NextResponse.json(
        { error: `Unsupported chain: ${chainId}` },
        { status: 400 },
      );
    }

    const publicClient = createPublicClient({
      chain: config.chain,
      transport: http(undefined, { batch: { wait: 50 }, retryCount: 0 }),
      batch: { multicall: true },
    });

    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
      signer: ownerAccount,
      entryPoint: ENTRY_POINT,
      kernelVersion: KERNEL_VERSION,
    });

    const sessionKeyViem = privateKeyToAccount(sessionKeyHex as Hex);
    const ecdsaSigner = await toECDSASigner({ signer: sessionKeyViem });

    const expiryTimestamp = Math.floor(Date.now() / 1000 + 30 * 24 * 60 * 60);
    const spendLimitPerTxMicro = BigInt(50 * 1e6);

    const permissionValidator = await toPermissionValidator(publicClient, {
      signer: ecdsaSigner,
      policies: buildSessionKeyPolicies(
        config.usdcAddress as Address,
        expiryTimestamp,
        spendLimitPerTxMicro,
      ),
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
      address: smartAccount.smartAccountAddress as Address,
    });

    const bundlerRpc = getZeroDevBundlerRpc(chainId);
    const bundlerTransport = http(bundlerRpc, { retryCount: 0 });
    const paymasterClient = createZeroDevPaymasterClient({
      chain: config.chain,
      transport: bundlerTransport,
    });
    const gasToken = getUsdcGasTokenAddress(chainId);

    const kernelClient = createKernelAccountClient({
      account: kernelAccount,
      chain: config.chain,
      bundlerTransport,
      client: publicClient,
      paymaster: {
        async getPaymasterStubData(userOperation) {
          try {
            return await paymasterClient.sponsorUserOperation({
              userOperation,
              shouldConsume: false,
            });
          } catch {
            if (!gasToken)
              throw new Error("Gas sponsorship unavailable");
            return paymasterClient.sponsorUserOperation({
              userOperation,
              gasToken,
              shouldConsume: false,
            });
          }
        },
        async getPaymasterData(userOperation) {
          try {
            return await paymasterClient.sponsorUserOperation({
              userOperation,
            });
          } catch {
            if (!gasToken)
              throw new Error("Gas sponsorship unavailable");
            return paymasterClient.sponsorUserOperation({
              userOperation,
              gasToken,
            });
          }
        },
      },
    });

    const userOpHash = await kernelClient.sendUserOperation({
      callData: await kernelAccount.encodeCalls([
        { to: zeroAddress, value: BigInt(0), data: "0x" },
      ]),
    });

    const receipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash,
      timeout: 120_000,
    });

    if (!receipt.success) {
      return NextResponse.json(
        { error: "UserOperation failed on-chain" },
        { status: 500 },
      );
    }

    const serialized = await serializePermissionAccount(
      kernelAccount,
      sessionKeyHex as Hex,
    );

    const grantTxHash = receipt.receipt.transactionHash;
    const serializedEncrypted = encryptPrivateKey(serialized);
    await storeSerializedAccount(auth.userId, chainId, serializedEncrypted);

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    await activateSessionKey(
      auth.userId,
      chainId,
      grantTxHash,
      expiryDate,
      Number(spendLimitPerTxMicro),
      Math.round(500 * 1e6),
    );

    return NextResponse.json({
      success: true,
      grantTxHash,
      sessionKeyStatus: "active",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

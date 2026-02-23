import { createPublicClient, http, type Hex, type Address } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createKernelAccount } from "@zerodev/sdk";
import { getKernelAddressFromECDSA } from "@zerodev/ecdsa-validator";
import { toPermissionValidator } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { deserializePermissionAccount } from "@zerodev/permissions";
import { encryptPrivateKey } from "@/lib/hot-wallet";
import { getChainConfig } from "@/lib/chain-config";
import { ENTRY_POINT, KERNEL_VERSION, buildSessionKeyPolicies } from "@/lib/smart-account-constants";
import type { ClientEvmSigner } from "@/lib/x402/types";

/**
 * Compute the deterministic CREATE2 address for a Kernel v3.3 smart account
 * owned by the given address. No on-chain transaction is needed — uses
 * CREATE2 address derivation from the ECDSA validator plugin.
 */
export async function computeSmartAccountAddress(
  ownerAddress: Address,
  chainId: number,
): Promise<Address> {
  const config = getChainConfig(chainId);
  if (!config) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }

  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(),
  });

  return getKernelAddressFromECDSA({
    publicClient,
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
    eoaAddress: ownerAddress,
    index: BigInt(0),
  });
}

/**
 * Generate a fresh session key and encrypt it using the same AES-256-GCM
 * scheme as hot-wallet.ts.
 */
export function createSessionKey(): {
  address: Address;
  encryptedPrivateKey: string;
} {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const encryptedPrivateKey = encryptPrivateKey(privateKey);
  return {
    address: account.address,
    encryptedPrivateKey,
  };
}

/**
 * Create a ClientEvmSigner backed by a Kernel v3.3 smart account with
 * a session key permission validator. This is the "full path" that
 * reconstructs the account from scratch using the session key.
 */
export async function createSmartAccountSigner(
  sessionKeyHex: Hex,
  smartAccountAddress: Address,
  chainId: number,
  expiryTimestamp: number,
  spendLimitPerTx?: bigint,
): Promise<ClientEvmSigner> {
  const config = getChainConfig(chainId);
  if (!config) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }

  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(),
  });

  const sessionKeyAccount = privateKeyToAccount(sessionKeyHex);

  const ecdsaSigner = await toECDSASigner({
    signer: sessionKeyAccount,
  });

  const permissionValidator = await toPermissionValidator(publicClient, {
    signer: ecdsaSigner,
    policies: buildSessionKeyPolicies(config.usdcAddress, expiryTimestamp, spendLimitPerTx),
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  const kernelAccount = await createKernelAccount(publicClient, {
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
    plugins: {
      regular: permissionValidator,
    },
    address: smartAccountAddress,
  });

  return {
    address: kernelAccount.address,
    signTypedData: (message) =>
      kernelAccount.signTypedData({
        domain: message.domain as Record<string, unknown>,
        types: message.types as Record<string, Array<{ name: string; type: string }>>,
        primaryType: message.primaryType,
        message: message.message,
      }),
  };
}

/**
 * Create a ClientEvmSigner from a serialized permission account.
 * This is the "fast path" — it deserializes a previously-serialized
 * Kernel account without needing to reconstruct validators from scratch.
 */
export async function createSmartAccountSignerFromSerialized(
  serializedAccount: string,
  sessionKeyHex: Hex,
  chainId: number,
): Promise<ClientEvmSigner> {
  const config = getChainConfig(chainId);
  if (!config) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }

  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(),
  });

  const sessionKeyAccount = privateKeyToAccount(sessionKeyHex);

  const ecdsaSigner = await toECDSASigner({
    signer: sessionKeyAccount,
  });

  const kernelAccount = await deserializePermissionAccount(
    publicClient,
    ENTRY_POINT,
    KERNEL_VERSION,
    serializedAccount,
    ecdsaSigner,
  );

  return {
    address: kernelAccount.address,
    signTypedData: (message) =>
      kernelAccount.signTypedData({
        domain: message.domain as Record<string, unknown>,
        types: message.types as Record<string, Array<{ name: string; type: string }>>,
        primaryType: message.primaryType,
        message: message.message,
      }),
  };
}

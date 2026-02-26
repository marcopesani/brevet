export const ALLOWED_BUNDLER_METHODS = new Set([
  "eth_sendUserOperation",
  "eth_estimateUserOperationGas",
  "zd_getUserOperationGasPrice",
  "zd_sponsorUserOperation",
  "pm_getPaymasterData",
  "pm_getPaymasterStubData",
  "pm_sponsorUserOperation",
  "eth_getUserOperationReceipt",
]);

const ERR_AA_MESSAGES: Record<string, string> = {
  AA13: "Smart account deployment failed or ran out of gas. Try again or use a higher gas limit.",
  AA14: "Account factory returned the wrong address. Please try again or contact support.",
  AA15: "Account factory did not deploy a contract at the expected address.",
  AA20: "Smart account is not deployed yet. Complete account setup first.",
  AA21: "Insufficient balance to cover transaction gas. Add funds to your smart account.",
  AA22: "Transaction window expired or not yet valid. Check your session or try again.",
  AA23: "Account validation failed. Your signature or permissions may be invalid or expired.",
  AA24: "Invalid signature. Ensure you're signing with the correct wallet or session key.",
  AA25: "Invalid or already-used nonce. Retry with a fresh transaction.",
  AA26: "Verification used more gas than allowed. Try again with a higher verification gas limit.",
  AA27: "Transaction is outside the allowed block range. Submit again.",
  AA31: "Paymaster has insufficient deposit. Gas sponsorship may be temporarily unavailable.",
  AA32: "Paymaster session expired or not yet valid. Try again or re-enable gas sponsorship.",
  AA33: "Paymaster rejected the transaction. Check spending limits and approval.",
  AA34: "Paymaster signature check failed. Re-authorize gas sponsorship if needed.",
  AA35: "Invalid paymaster data. Re-submit the transaction or refresh the app.",
  AA36: "Paymaster verification used too much gas. Try with a higher limit or try again.",
  AA37: "Paymaster is outside the allowed block range. Try again.",
  AA94: "Gas parameters too large. Reduce gas limits and try again.",
  AA50: "Gas sponsorship failed. The paymaster could not complete the transaction.",
  AA95: "Transaction ran out of gas. The bundler may need a higher gas limit.",
  AA99: "Invalid account deployment data. Ensure setup is complete and try again.",
};

const ERR_AA_GROUP: Record<string, string> = {
  AA1: "Account deployment or factory failed. Complete setup and try again.",
  AA2: "Smart account validation failed. Check balance, signature, and nonce.",
  AA3: "Gas sponsorship (paymaster) failed. Check limits or try without sponsorship.",
  AA9: "A transaction parameter or gas limit caused the failure. Adjust and try again.",
};

const BUNDLER_POSTOP_HINTS: Record<string, string> = {
  "0x7939f424":
    "TransferFromFailed — paymaster could not pull USDC for gas. Ensure your smart account has enough USDC and has approved the paymaster, or enable gas sponsorship in the ZeroDev dashboard.",
};

export function toHumanReadableBundlerError(raw: string): string {
  const postOpMatch = raw.match(/AA50 postOp reverted (0x[0-9a-fA-F]{8})/);
  if (postOpMatch) {
    const hint = BUNDLER_POSTOP_HINTS[postOpMatch[1].toLowerCase()];
    if (hint) return hint;
  }

  const aaMatch = raw.match(/AA(\d{2})\b/);
  if (aaMatch) {
    const code = `AA${aaMatch[1]}`;
    const group = `AA${aaMatch[1].charAt(0)}`;
    const specific = ERR_AA_MESSAGES[code];
    const fallback = ERR_AA_GROUP[group];
    return specific ?? fallback ?? raw;
  }

  return raw;
}

/**
 * Extract the error message from a JSON-RPC error response.
 * Handles both `{ message: string }` objects and raw string/number errors.
 */
export function extractJsonRpcError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
}

export type SessionStatus = "connected" | "disconnected" | "expiring";

const EXPIRY_WARNING_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Determine session status based on connection state and optional expiry time.
 */
export function getSessionStatus(
  isConnected: boolean,
  expiryTimestamp?: number,
): SessionStatus {
  if (!isConnected) return "disconnected";

  if (expiryTimestamp) {
    const timeUntilExpiry = expiryTimestamp * 1000 - Date.now();
    if (timeUntilExpiry <= 0) return "disconnected";
    if (timeUntilExpiry <= EXPIRY_WARNING_MS) return "expiring";
  }

  return "connected";
}

/**
 * Check if a session is expiring within 24 hours.
 */
export function isSessionExpiringSoon(expiryTimestamp?: number): boolean {
  if (!expiryTimestamp) return false;
  const timeUntilExpiry = expiryTimestamp * 1000 - Date.now();
  return timeUntilExpiry > 0 && timeUntilExpiry <= EXPIRY_WARNING_MS;
}

/**
 * Truncate an Ethereum address for display.
 */
export function truncateAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Server-only: session key limits from env. Do not import from client components.
 * For ENTRY_POINT, KERNEL_VERSION, buildSessionKeyPolicies use @/lib/smart-account-policies.
 */
export { ENTRY_POINT, KERNEL_VERSION, buildSessionKeyPolicies } from "@/lib/smart-account-policies";

function requireEnvInt(name: string): number {
  const raw = process.env[name];
  if (!raw) throw new Error(`Missing required env var: ${name}`);
  const val = parseInt(raw, 10);
  if (Number.isNaN(val) || val <= 0)
    throw new Error(
      `Invalid env var ${name}: must be a positive integer, got "${raw}"`,
    );
  return val;
}

export const SESSION_KEY_MAX_SPEND_PER_TX = requireEnvInt(
  "SESSION_KEY_MAX_SPEND_PER_TX",
);
export const SESSION_KEY_MAX_SPEND_DAILY = requireEnvInt(
  "SESSION_KEY_MAX_SPEND_DAILY",
);
export const SESSION_KEY_MAX_EXPIRY_DAYS = requireEnvInt(
  "SESSION_KEY_MAX_EXPIRY_DAYS",
);
export const SESSION_KEY_DEFAULT_EXPIRY_DAYS = requireEnvInt(
  "SESSION_KEY_DEFAULT_EXPIRY_DAYS",
);

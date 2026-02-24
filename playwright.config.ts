import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const mongoUri = process.env.MONGODB_URI ?? process.env.E2E_MONGODB_URI;
const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
  process.env.E2E_WALLETCONNECT_PROJECT_ID ??
  "e2e-walletconnect-project-id";
const chainId = process.env.NEXT_PUBLIC_CHAIN_ID ?? process.env.E2E_CHAIN_ID ?? "80002";
const zeroDevProjectId =
  process.env.ZERODEV_PROJECT_ID ??
  process.env.E2E_ZERODEV_PROJECT_ID ??
  "e2e-zerodev-project-id";
const sessionKeyMaxSpendPerTx = process.env.SESSION_KEY_MAX_SPEND_PER_TX ?? "1000000000000";
const sessionKeyMaxSpendDaily = process.env.SESSION_KEY_MAX_SPEND_DAILY ?? "10000000000000";
const sessionKeyMaxExpiryDays = process.env.SESSION_KEY_MAX_EXPIRY_DAYS ?? "365";
const sessionKeyDefaultExpiryDays = process.env.SESSION_KEY_DEFAULT_EXPIRY_DAYS ?? "30";
const hotWalletEncryptionKey =
  process.env.HOT_WALLET_ENCRYPTION_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const webServerCommand = [
  "NEXT_PUBLIC_TEST_MODE=true",
  `NEXT_PUBLIC_CHAIN_ID=${chainId}`,
  `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=${walletConnectProjectId}`,
  "NEXTAUTH_SECRET=e2e-nextauth-secret-with-32chars",
  `ZERODEV_PROJECT_ID=${zeroDevProjectId}`,
  `SESSION_KEY_MAX_SPEND_PER_TX=${sessionKeyMaxSpendPerTx}`,
  `SESSION_KEY_MAX_SPEND_DAILY=${sessionKeyMaxSpendDaily}`,
  `SESSION_KEY_MAX_EXPIRY_DAYS=${sessionKeyMaxExpiryDays}`,
  `SESSION_KEY_DEFAULT_EXPIRY_DAYS=${sessionKeyDefaultExpiryDays}`,
  `HOT_WALLET_ENCRYPTION_KEY=${hotWalletEncryptionKey}`,
  ...(mongoUri ? [`MONGODB_URI=${mongoUri}`] : []),
  "node scripts/e2e-dev-server.mjs",
].join(" ");

export default defineConfig({
  testDir: "./e2e/specs",
  timeout: 120_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});

import { defineConfig, devices } from "@playwright/test";

// Run tests from project root so webServer and testDir resolve correctly.
const projectRoot = process.cwd();

// Test-only config: no process.env / .env. All values are explicit for e2e.
const E2E_ENV = {
  NODE_ENV: "development",
  PORT: "3000",
  NEXT_PUBLIC_TEST_MODE: "true",
  NEXT_PUBLIC_E2E_REAL_METAMASK: "false",
  NEXT_PUBLIC_CHAIN_ID: "80002",
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "e2e-walletconnect-project-id",
  NEXTAUTH_SECRET: "e2e-nextauth-secret-with-32chars",
  ZERODEV_PROJECT_ID: "e2e-zerodev-project-id",
  SESSION_KEY_MAX_SPEND_PER_TX: "1000000000000",
  SESSION_KEY_MAX_SPEND_DAILY: "10000000000000",
  SESSION_KEY_MAX_EXPIRY_DAYS: "365",
  SESSION_KEY_DEFAULT_EXPIRY_DAYS: "30",
  HOT_WALLET_ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
} as const;

const baseURL = "http://127.0.0.1:3000";
const webServerCommand = [
  ...Object.entries(E2E_ENV).map(([k, v]) => `${k}=${v}`),
  "node e2e/helpers/dev-server.mjs",
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
    cwd: projectRoot, // ensure dev server runs from project root (no e2e/.next)
  },
});

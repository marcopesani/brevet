import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const mongoUri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/brevet";
const webServerCommand = [
  "NEXT_PUBLIC_TEST_MODE=true",
  "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=e2e-walletconnect-project-id",
  "NEXTAUTH_SECRET=e2e-nextauth-secret-with-32chars",
  "ZERODEV_PROJECT_ID=e2e-zerodev-project-id",
  `MONGODB_URI=${mongoUri}`,
  "npm run dev",
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

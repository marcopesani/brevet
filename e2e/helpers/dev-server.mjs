#!/usr/bin/env node
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { MongoMemoryServer } from "mongodb-memory-server";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");

// Only pass these env vars to Next. MONGODB_URI is set from in-memory server below.
const E2E_ENV_KEYS = [
  "NODE_ENV",
  "PORT",
  "NEXT_PUBLIC_TEST_MODE",
  "NEXT_PUBLIC_E2E_REAL_METAMASK",
  "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
  "NEXTAUTH_SECRET",
  "ZERODEV_PROJECT_ID",
  "SESSION_KEY_MAX_SPEND_PER_TX",
  "SESSION_KEY_MAX_SPEND_DAILY",
  "SESSION_KEY_MAX_EXPIRY_DAYS",
  "SESSION_KEY_DEFAULT_EXPIRY_DAYS",
  "HOT_WALLET_ENCRYPTION_KEY",
];

async function main() {
  process.chdir(root);
  const mongod = await MongoMemoryServer.create();
  const mongoUri = mongod.getUri();

  const env = { ...process.env };
  const childEnv = {
    PATH: env.PATH ?? process.env.Path ?? "",
    NODE_ENV: env.NODE_ENV ?? "development",
    NEXT_TELEMETRY_DISABLED: "1",
    MONGODB_URI: mongoUri,
    ...Object.fromEntries(
      E2E_ENV_KEYS.filter((k) => env[k] != null).map((k) => [k, env[k]]),
    ),
  };
  childEnv.PORT = childEnv.PORT || "3000";

  const child = spawn("npx", ["next", "dev"], {
    stdio: "inherit",
    cwd: root,
    shell: true,
    env: childEnv,
  });

  child.on("error", (err) => {
    console.error(err);
    mongod.stop().then(() => process.exit(1));
  });
  child.on("exit", async (code) => {
    await mongod.stop();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

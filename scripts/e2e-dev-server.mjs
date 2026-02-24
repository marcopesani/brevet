import { spawn } from "node:child_process";
import process from "node:process";
import { MongoMemoryServer } from "mongodb-memory-server";

const isStopping = { value: false };
let mongoServer;
let child;

async function stopAll(exitCode = 0) {
  if (isStopping.value) return;
  isStopping.value = true;

  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
  }

  if (mongoServer) {
    await mongoServer.stop();
  }

  process.exit(exitCode);
}

async function main() {
  let mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    mongoServer = await MongoMemoryServer.create({
      instance: {
        ip: "127.0.0.1",
        dbName: "brevet",
      },
    });
    mongoUri = mongoServer.getUri("brevet");
    console.log(`[e2e-dev-server] Started in-memory MongoDB at ${mongoUri}`);
  } else {
    console.log(`[e2e-dev-server] Using provided MongoDB URI`);
  }

  child = spawn("npm", ["run", "dev"], {
    stdio: "inherit",
    env: {
      ...process.env,
      MONGODB_URI: mongoUri,
    },
  });

  child.on("exit", async (code, signal) => {
    if (signal) {
      await stopAll(1);
      return;
    }
    await stopAll(code ?? 0);
  });

  process.on("SIGINT", () => {
    void stopAll(130);
  });
  process.on("SIGTERM", () => {
    void stopAll(143);
  });
}

void main().catch(async (error) => {
  console.error("[e2e-dev-server] Failed to start", error);
  await stopAll(1);
});

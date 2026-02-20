import "@testing-library/jest-dom/vitest";
import { beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Set test environment variables before any imports that might read them
process.env.MONGODB_URI = "mongodb://localhost:27017/test"; // overridden by MongoMemoryServer
process.env.NEXT_PUBLIC_CHAIN_ID = "84532";
process.env.HOT_WALLET_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = "test-project-id";
process.env.SESSION_KEY_MAX_SPEND_PER_TX = "1000000000000";
process.env.SESSION_KEY_MAX_SPEND_DAILY = "10000000000000";
process.env.SESSION_KEY_MAX_EXPIRY_DAYS = "365";
process.env.SESSION_KEY_DEFAULT_EXPIRY_DAYS = "30";

// Mock @/lib/db globally so no test needs a real MongoDB connection.
// Tests connect via MongoMemoryServer directly in beforeAll below.
vi.mock("@/lib/db", () => ({
  connectDB: async () => {},
}));

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  // Clear all collections between tests for isolation
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

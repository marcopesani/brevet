import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import mongoose from "mongoose";

// Unmock @/lib/db so we test the real implementation
vi.unmock("@/lib/db");

describe("connectDB", () => {
  const origPoolSize = process.env.DATABASE_POOL_SIZE;
  const origMongoUri = process.env.MONGODB_URI;

  beforeEach(() => {
    delete process.env.DATABASE_POOL_SIZE;
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";
  });

  afterEach(() => {
    if (origPoolSize !== undefined) {
      process.env.DATABASE_POOL_SIZE = origPoolSize;
    } else {
      delete process.env.DATABASE_POOL_SIZE;
    }
    if (origMongoUri !== undefined) {
      process.env.MONGODB_URI = origMongoUri;
    } else {
      delete process.env.MONGODB_URI;
    }
  });

  it("returns mongoose instance when already connected", async () => {
    // MongoMemoryServer is already connected via setup.ts
    expect(mongoose.connection.readyState).toBe(1);

    const { connectDB } = await import("../db");
    const result = await connectDB();
    expect(result).toBe(mongoose);
  });

  it("mongoose connection is active and usable", () => {
    expect(mongoose.connection.readyState).toBe(1);
    expect(mongoose.connection.db).toBeDefined();
  });
});

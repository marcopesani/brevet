import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.unmock("@/lib/db");

vi.mock("@/generated/prisma/client", () => {
  return { PrismaClient: class MockPrismaClient {} };
});

vi.mock("@prisma/adapter-pg", () => {
  return { PrismaPg: class MockPrismaPg {} };
});

import { getPoolConfig } from "../db";

describe("getPoolConfig", () => {
  const origPoolSize = process.env.DATABASE_POOL_SIZE;
  const origDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_POOL_SIZE;
    process.env.DATABASE_URL = "postgresql://localhost:5432/test";
  });

  afterEach(() => {
    if (origPoolSize !== undefined) {
      process.env.DATABASE_POOL_SIZE = origPoolSize;
    } else {
      delete process.env.DATABASE_POOL_SIZE;
    }
    if (origDatabaseUrl !== undefined) {
      process.env.DATABASE_URL = origDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("returns default pool size of 20 when DATABASE_POOL_SIZE is not set", () => {
    const config = getPoolConfig();
    expect(config.max).toBe(20);
  });

  it("uses custom pool size when DATABASE_POOL_SIZE is valid", () => {
    process.env.DATABASE_POOL_SIZE = "30";
    const config = getPoolConfig();
    expect(config.max).toBe(30);
  });

  it("falls back to 20 when DATABASE_POOL_SIZE is not a number", () => {
    process.env.DATABASE_POOL_SIZE = "not-a-number";
    const config = getPoolConfig();
    expect(config.max).toBe(20);
  });

  it("falls back to 20 when DATABASE_POOL_SIZE is zero", () => {
    process.env.DATABASE_POOL_SIZE = "0";
    const config = getPoolConfig();
    expect(config.max).toBe(20);
  });

  it("falls back to 20 when DATABASE_POOL_SIZE is negative", () => {
    process.env.DATABASE_POOL_SIZE = "-5";
    const config = getPoolConfig();
    expect(config.max).toBe(20);
  });

  it("sets idleTimeoutMillis to 30000", () => {
    const config = getPoolConfig();
    expect(config.idleTimeoutMillis).toBe(30_000);
  });

  it("sets connectionTimeoutMillis to 10000", () => {
    const config = getPoolConfig();
    expect(config.connectionTimeoutMillis).toBe(10_000);
  });

  it("includes the DATABASE_URL as connectionString", () => {
    process.env.DATABASE_URL = "postgresql://custom:5432/mydb";
    const config = getPoolConfig();
    expect(config.connectionString).toBe("postgresql://custom:5432/mydb");
  });
});

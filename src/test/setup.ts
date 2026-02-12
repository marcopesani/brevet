import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Set test environment variables before any imports that might read them
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/test";
process.env.NEXT_PUBLIC_CHAIN_ID = "84532";
process.env.HOT_WALLET_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = "test-project-id";

// Mock @/lib/db globally so no test needs a real Postgres connection.
// The factory is called lazily by vitest, so we can import inside it.
vi.mock("@/lib/db", async () => {
  const { createPrismaMock } = await import("./helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});

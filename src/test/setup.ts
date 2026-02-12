import "@testing-library/jest-dom/vitest";

// Set test environment variables before any imports that might read them
process.env.DATABASE_URL = "file:./prisma/test.db";
process.env.NEXT_PUBLIC_CHAIN_ID = "84532";
process.env.HOT_WALLET_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = "test-project-id";

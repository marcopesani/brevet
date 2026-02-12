import { vi } from "vitest";
import { TEST_USER_ID } from "./fixtures";

/**
 * Mock the Supabase auth helper used by all API routes.
 * Call this at the top of test files that exercise authenticated routes.
 *
 * Usage:
 *   vi.mock("@/lib/auth", () => mockAuth());
 *
 * To simulate an unauthenticated request in a specific test:
 *   import { getAuthenticatedUser } from "@/lib/auth";
 *   vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);
 */
export function mockAuth(userId: string = TEST_USER_ID) {
  return {
    getAuthenticatedUser: vi.fn().mockResolvedValue({ userId }),
  };
}

/**
 * Mock the Supabase client used by auth routes (signup, signin, signout).
 * Returns a mock factory whose methods can be further configured per-test.
 */
export function mockSupabaseClient() {
  const mockSignUp = vi.fn();
  const mockSignInWithPassword = vi.fn();
  const mockSignOut = vi.fn();
  const mockGetClaims = vi.fn();
  const mockExchangeCodeForSession = vi.fn();

  const client = {
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      getClaims: mockGetClaims,
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  };

  return {
    createClient: vi.fn().mockResolvedValue(client),
    client,
    mockSignUp,
    mockSignInWithPassword,
    mockSignOut,
    mockGetClaims,
    mockExchangeCodeForSession,
  };
}

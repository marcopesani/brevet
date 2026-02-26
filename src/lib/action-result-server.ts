import { getAuthenticatedUser } from "@/lib/auth";
import { type ActionResult, err } from "@/lib/action-result";

/**
 * Wraps a server action mutation with authentication and error handling.
 * 1. Checks auth — returns err("Unauthorized") if not authenticated
 * 2. Executes the provided function
 * 3. Catches unexpected errors — returns err(message)
 *
 * Server-only — do not import from Client Components.
 */
export async function withAuth<T>(
  fn: (auth: {
    userId: string;
    walletAddress: string;
  }) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const auth = await getAuthenticatedUser();
  if (!auth) return err("Unauthorized");

  try {
    return await fn(auth);
  } catch (error) {
    return err(
      error instanceof Error ? error.message : "An unexpected error occurred",
    );
  }
}

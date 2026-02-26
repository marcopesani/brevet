export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function err<T = never>(error: string): ActionResult<T> {
  return { success: false, error };
}

/**
 * Extract data from an ActionResult, throwing if the result is an error.
 * Useful in sequential client-side flows (e.g. inside a React Query mutationFn)
 * so that React Query's onError still fires on failure.
 */
export function unwrap<T>(result: ActionResult<T>): T {
  if (!result.success) throw new Error(result.error);
  return result.data;
}

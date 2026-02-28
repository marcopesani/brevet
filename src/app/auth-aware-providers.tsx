import { headers } from "next/headers";
import { getValidatedChainId } from "@/lib/server/chain";
import { getAuthenticatedUser } from "@/lib/auth";
import { getUserEnabledChains } from "@/lib/data/user";
import { getPendingPaymentChainId, getPendingCount } from "@/lib/data/payments";
import Providers from "./providers";

/**
 * Async server component that fetches auth and chain data, then renders
 * Providers. Used inside <Suspense> in the root layout so the route
 * is not blocking (see Next.js "blocking route" / uncached data).
 */
export default async function AuthAwareProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersObj = await headers();
  const cookies = headersObj.get("cookie");

  const user = await getAuthenticatedUser();
  const enabledChains = user
    ? await getUserEnabledChains(user.userId)
    : undefined;
  let initialChainId = user
    ? await getValidatedChainId(cookies, user.userId)
    : undefined;

  // Auto-switch to a chain with pending payments if the cookie chain has none.
  // Prevents users from opening the dashboard and missing actionable payments
  // on a different chain than the one stored in the cookie.
  if (user && initialChainId !== undefined && enabledChains) {
    const pendingOnCookie = await getPendingCount(user.userId, { chainId: initialChainId });
    if (pendingOnCookie === 0) {
      const chainWithPending = await getPendingPaymentChainId(user.userId);
      if (chainWithPending !== null && enabledChains.includes(chainWithPending)) {
        initialChainId = chainWithPending;
      }
    }
  }

  return (
    <Providers
      cookies={cookies}
      initialChainId={initialChainId}
      enabledChains={enabledChains}
    >
      {children}
    </Providers>
  );
}

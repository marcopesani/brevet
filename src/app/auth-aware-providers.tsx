import { headers } from "next/headers";
import { getValidatedChainId } from "@/lib/server/chain";
import { getAuthenticatedUser } from "@/lib/auth";
import { getUserEnabledChains } from "@/lib/data/user";
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
  const initialChainId = user
    ? await getValidatedChainId(cookies, user.userId)
    : undefined;

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

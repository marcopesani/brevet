import { headers } from "next/headers";
import { getInitialChainIdFromCookie } from "@/lib/chain-cookie";
import { resolveValidChainId } from "@/lib/chain-config";
import { getAuthenticatedUser } from "@/lib/auth";
import { getUserEnabledChains } from "@/lib/data/user";
import {
  getSmartAccountForChain,
  getAllSmartAccountsAction,
  getSmartAccountBalanceAction,
} from "@/app/actions/smart-account";
import WalletContent from "./wallet-content";

export default async function WalletPageContent() {
  const user = (await getAuthenticatedUser())!;

  const headersList = await headers();
  const cookieHeader = headersList.get("cookie");
  const rawChainId = getInitialChainIdFromCookie(cookieHeader);
  const enabledChains = await getUserEnabledChains(user.userId);
  const initialChainId = resolveValidChainId(rawChainId, enabledChains);

  const [smartAccount, allAccounts, balance] = await Promise.all([
    getSmartAccountForChain(initialChainId),
    getAllSmartAccountsAction(),
    getSmartAccountBalanceAction(initialChainId),
  ]);

  return (
    <WalletContent
      initialData={{
        smartAccount,
        allAccounts: allAccounts ?? [],
        balance: balance ?? null,
      }}
      initialChainId={initialChainId}
    />
  );
}

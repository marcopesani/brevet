import { headers } from "next/headers";
import { getValidatedChainId } from "@/lib/server/chain";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  getSmartAccountForChain,
  getAllSmartAccountsAction,
  getSmartAccountBalanceAction,
} from "@/app/actions/smart-account";
import WalletContent from "./wallet-content";

export default async function WalletPageContent() {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const headersList = await headers();
  const cookieHeader = headersList.get("cookie");
  const initialChainId = await getValidatedChainId(cookieHeader, user.userId);

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

import { headers } from "next/headers";
import { getInitialChainIdFromCookie } from "@/lib/chain-cookie";
import {
  getSmartAccountForChain,
  getAllSmartAccountsAction,
  getSmartAccountBalanceAction,
} from "@/app/actions/smart-account";
import WalletContent from "./wallet-content";

export default async function WalletPageContent() {
  const headersList = await headers();
  const cookieHeader = headersList.get("cookie");
  const initialChainId = getInitialChainIdFromCookie(cookieHeader);

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

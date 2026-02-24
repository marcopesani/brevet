import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAuthenticatedUser } from "@/lib/auth";
import { getValidatedChainId } from "@/lib/server/chain";
import { getAllSmartAccountsAction } from "@/app/actions/smart-account";
import { SmartAccountCard } from "@/components/smart-account-card";
import { getTransactions } from "@/lib/data/transactions";
import { TransactionTable } from "@/components/transaction-table";

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const headersList = await headers();
  const cookieHeader = headersList.get("cookie");
  const chainId = await getValidatedChainId(cookieHeader, user.userId);
  const smartAccounts = await getAllSmartAccountsAction();
  const transactions = await getTransactions(user.userId, { chainId });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <h2 className="text-xl font-bold">Smart Accounts</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {smartAccounts.map((smartAccount) => (
          <SmartAccountCard
            key={smartAccount.id}
            chainId={smartAccount.chainId}
            address={smartAccount.smartAccountAddress}
            isCurrentChain={smartAccount.chainId === chainId}
          />
        ))}
      </div>
      <h2 className="text-xl font-bold">Transactions</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
      <TransactionTable initialTransactions={transactions} />
      </div>
    </div>
  );
}

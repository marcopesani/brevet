import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Suspense } from "react";
import { getAuthenticatedUser } from "@/lib/auth";
import { getValidatedChainId } from "@/lib/server/chain";
import WalletPageContent from "./wallet-page-content";
import WalletLoading from "./loading";

export default async function WalletPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  const headersList = await headers();
  const cookieHeader = headersList.get("cookie");
  const chainId = await getValidatedChainId(cookieHeader, user.userId);

  return (
    <Suspense fallback={<WalletLoading />}>
      <WalletPageContent userId={user.userId} chainId={chainId} />
    </Suspense>
  );
}

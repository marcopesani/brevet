import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAuthenticatedUser } from "@/lib/auth";
import WalletPageContent from "./wallet-page-content";
import WalletLoading from "./loading";

export default async function WalletPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <Suspense fallback={<WalletLoading />}>
      <WalletPageContent />
    </Suspense>
  );
}

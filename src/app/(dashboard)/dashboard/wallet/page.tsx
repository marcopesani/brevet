import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureHotWallet, getWalletBalance } from "@/lib/data/wallet";
import WalletContent from "./wallet-content";

export default async function WalletPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  const wallet = await ensureHotWallet(user.userId);
  const walletBalance = wallet
    ? await getWalletBalance(user.userId)
    : null;

  return (
    <WalletContent
      hotWalletAddress={wallet?.address ?? null}
      userId={user.userId}
      initialBalance={walletBalance?.balance ?? null}
    />
  );
}

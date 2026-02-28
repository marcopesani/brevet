import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { loadMerchants, getCategories } from "@/lib/merchants";
import { MerchantDirectory } from "@/components/merchant-directory";

export default async function DirectoryPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const merchants = loadMerchants();
  const categories = getCategories();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-lg font-semibold">Merchant Directory</h3>
        <p className="text-sm text-muted-foreground">
          Browse merchants that accept x402 payments.
        </p>
      </div>
      <MerchantDirectory merchants={merchants} categories={categories} />
    </div>
  );
}

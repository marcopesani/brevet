import type { Metadata } from "next";
import { connection } from "next/server";
import { loadMerchants, getCategories } from "@/lib/merchants";
import { MerchantDirectoryPublic } from "@/components/landing/merchant-directory-public";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Merchant Directory — Brevet",
  description:
    "Browse services, tools, and APIs that accept x402 payments. Find what your AI agents can pay for.",
  openGraph: {
    title: "Merchant Directory — Brevet",
    description:
      "Browse services, tools, and APIs that accept x402 payments. Find what your AI agents can pay for.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Merchant Directory — Brevet",
    description:
      "Browse services, tools, and APIs that accept x402 payments.",
  },
};

export default async function DirectoryPage() {
  await connection();
  const merchants = loadMerchants();
  const categories = getCategories();

  return (
    <>
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Merchant Directory
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Services, tools, and APIs that accept x402 payments.
              Connect your AI agents and start paying.
            </p>
          </div>

          <div className="mt-12">
            <MerchantDirectoryPublic
              merchants={merchants}
              categories={categories}
            />
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}

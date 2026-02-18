import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Features } from "@/components/landing/features";
import { Security } from "@/components/landing/security";
import { CtaSection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Brevet — Your Agent's Spending Authority",
  description:
    "Connect your wallet. Let your agents pay for APIs autonomously. Spending policies, tiered signing, dashboard.",
  openGraph: {
    title: "Brevet — Your Agent's Spending Authority",
    description:
      "Connect your wallet. Let your agents pay for APIs autonomously. Spending policies, tiered signing, dashboard.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Brevet — Your Agent's Spending Authority",
    description:
      "Connect your wallet. Let your agents pay for APIs autonomously. Spending policies, tiered signing, dashboard.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Brevet",
  description:
    "Connect your wallet. Let your agents pay for APIs autonomously using the x402 HTTP payment protocol with USDC on Base.",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free to set up. You only pay for what your agents use.",
  },
};

export default async function Home() {
  const user = await getAuthenticatedUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero />
      <HowItWorks />
      <Features />
      <Security />
      <CtaSection />
      <Footer />
    </>
  );
}

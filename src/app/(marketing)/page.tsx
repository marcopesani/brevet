import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { UseCases } from "@/components/landing/use-cases";
import { Features } from "@/components/landing/features";
import { Security } from "@/components/landing/security";
import { CtaSection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Brevet — Pay with internet money",
  description:
    "The open-source MCP wallet for AI agent payments. Deploy, fund, and let your agents pay for APIs, data, and goods on any chain.",
  openGraph: {
    title: "Brevet — Pay with internet money",
    description:
      "The open-source MCP wallet for AI agent payments. Deploy, fund, and let your agents pay for APIs, data, and goods on any chain.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Brevet — Pay with internet money",
    description:
      "The open-source MCP wallet for AI agent payments. Deploy, fund, and let your agents pay for APIs, data, and goods on any chain.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Brevet",
  description:
    "The open-source MCP wallet for AI agent payments. Deploy, fund, and let your agents pay for APIs, data, and goods on any chain.",
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
      <UseCases />
      <Features />
      <Security />
      <CtaSection />
      <Footer />
    </>
  );
}

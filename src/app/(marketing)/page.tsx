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
  title: "PayMCP — AI Agent Payment Gateway for x402 APIs",
  description:
    "Let your AI agents pay for APIs automatically. PayMCP uses the x402 protocol with USDC on Base for secure, programmable payments.",
  openGraph: {
    title: "PayMCP — AI Agent Payment Gateway for x402 APIs",
    description:
      "Let your AI agents pay for APIs automatically. PayMCP uses the x402 protocol with USDC on Base for secure, programmable payments.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PayMCP — AI Agent Payment Gateway for x402 APIs",
    description:
      "Let your AI agents pay for APIs automatically. PayMCP uses the x402 protocol with USDC on Base for secure, programmable payments.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "PayMCP",
  description:
    "AI agent payment gateway using the x402 HTTP payment protocol with USDC on Base.",
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

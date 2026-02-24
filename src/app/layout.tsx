import type { Metadata } from "next";
import { Analytics } from '@vercel/analytics/next';
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { getValidatedChainId } from "@/lib/server/chain";
import { getAuthenticatedUser } from "@/lib/auth";
import { getUserEnabledChains } from "@/lib/data/user";
import Providers from "./providers";
import "./globals.css";

const roobert = localFont({
  src: "../../public/fonts/roobert.woff2",
  variable: "--font-roobert",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  display: "swap",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Brevet",
  description: "Spending authority for AI agents.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersObj = await headers();
  const cookies = headersObj.get("cookie");

  const user = await getAuthenticatedUser();
  const enabledChains = user
    ? await getUserEnabledChains(user.userId)
    : undefined;
  const initialChainId = user
    ? await getValidatedChainId(cookies, user.userId)
    : undefined;

  return (
    <html lang="en">
      <body className={`${roobert.variable} ${geistMono.variable} font-sans antialiased`}>
        <Providers
          cookies={cookies}
          initialChainId={initialChainId}
          enabledChains={enabledChains}
        >
          {children}
          <Analytics />
        </Providers>
      </body>
    </html>
  );
}

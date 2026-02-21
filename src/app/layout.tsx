import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { getInitialChainIdFromCookie } from "@/lib/chain-cookie";
import { getAuthenticatedUser } from "@/lib/auth";
import { getUserEnabledChains } from "@/lib/data/user";
import Providers from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
  const initialChainId = getInitialChainIdFromCookie(cookies);

  const user = await getAuthenticatedUser();
  const enabledChains = user ? await getUserEnabledChains(user.userId) : undefined;

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers cookies={cookies} initialChainId={initialChainId} enabledChains={enabledChains}>
          {children}
        </Providers>
      </body>
    </html>
  );
}

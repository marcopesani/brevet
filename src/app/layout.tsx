import type { Metadata } from "next";
import { Suspense } from "react";
import { Analytics } from '@vercel/analytics/next';
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import AuthAwareProviders from "./auth-aware-providers";
import "./globals.css";

// Needed for CSP nonce-based headers.
// https://nextjs.org/docs/app/building-your-application/routing/middleware#csp-nonce-based-headers
export const dynamic = "force-dynamic";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${roobert.variable} ${geistMono.variable} font-sans antialiased`}>
        <Suspense fallback={null}>
          <AuthAwareProviders>
            {children}
            <Analytics />
          </AuthAwareProviders>
        </Suspense>
      </body>
    </html>
  );
}

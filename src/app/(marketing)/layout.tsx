import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="font-semibold">
            Brevet
          </Link>
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/login">Get Started</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}

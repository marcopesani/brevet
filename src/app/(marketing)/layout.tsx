import Link from "next/link";
import { Github } from "lucide-react";
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
          <div className="flex items-center gap-4">
            <Link href="/" className="font-semibold">
              Brevet
            </Link>
            <Link
              href="/directory"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Directory
            </Link>
            <Link
              href="https://github.com/marcopesani/brevet"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="size-4" />
            </Link>
          </div>
          <Button asChild size="sm">
            <Link href="/login">Try now</Link>
          </Button>
        </nav>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}

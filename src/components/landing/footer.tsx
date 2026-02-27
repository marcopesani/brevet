import Link from "next/link";
import { Github } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const supportedChains = [
  "Ethereum",
  "Base",
  "Optimism",
  "Polygon",
  "Arbitrum",
];

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div>
            <p className="font-semibold">Brevet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              100% open source &middot; Built with x402 protocol
            </p>
          </div>

          <nav aria-label="Footer" className="flex items-center gap-6">
            <Link
              href="https://github.com/marcopesani/brevet"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="size-4" />
              GitHub
            </Link>
            <Link
              href="https://github.com/marcopesani/brevet#readme"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Documentation
            </Link>
          </nav>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {supportedChains.map((chain) => (
            <span
              key={chain}
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground"
            >
              {chain}
            </span>
          ))}
        </div>

        <Separator className="my-8" />

        <p className="text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Brevet. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

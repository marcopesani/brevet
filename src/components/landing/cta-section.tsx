import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CtaSection() {
  return (
    <section className="py-24 bg-muted/50">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Start paying with internet money
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Free to deploy. Open source. You only pay for what your agents use.
        </p>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Button asChild size="lg" className="text-base">
            <Link href="/login">
              Try now
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="text-base">
            <a
              href="https://vercel.com/new/clone?repository-url=https://github.com/marcopesani/brevet"
              target="_blank"
              rel="noopener noreferrer"
            >
              Deploy on Vercel
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

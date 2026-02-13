import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CtaSection() {
  return (
    <section className="py-24 bg-muted/50">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Ready to Automate API Payments?
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Free to set up. You only pay for what your agents use.
        </p>
        <div className="mt-10">
          <Button asChild size="lg" className="text-base">
            <Link href="/login">
              Get Started
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

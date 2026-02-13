import { Lock, FileCheck, ShieldCheck, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const securityFeatures = [
  {
    title: "AES-256 Encrypted Keys",
    description: "Hot wallet private keys are encrypted at rest with AES-256.",
    icon: Lock,
  },
  {
    title: "EIP-712 Typed Signing",
    description:
      "All payment authorizations use EIP-712 typed data for clear, verifiable signatures.",
    icon: FileCheck,
  },
  {
    title: "Per-Endpoint Policies",
    description:
      "Granular spending policies per API endpoint keep your agents within budget.",
    icon: ShieldCheck,
  },
  {
    title: "On-Chain Verification",
    description:
      "Every transaction is verifiable on-chain via BaseScan for full transparency.",
    icon: ExternalLink,
  },
];

export function Security() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Built for Security
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Enterprise-grade security at every layer of the payment flow.
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2">
          {securityFeatures.map(({ title, description, icon: Icon }) => (
            <div key={title} className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-2">
          <Badge variant="outline">x402 Protocol</Badge>
          <Badge variant="outline">USDC on Base</Badge>
          <Badge variant="outline">EIP-712</Badge>
          <Badge variant="outline">AES-256</Badge>
          <Badge variant="outline">WalletConnect</Badge>
        </div>
      </div>
    </section>
  );
}

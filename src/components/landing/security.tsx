import { Badge } from "@/components/ui/badge";

const trustItems = [
  "Open Source",
  "Smart Accounts",
  "On-Chain Verification",
  "Encrypted Keys",
  "Auditable",
];

export function Security() {
  return (
    <section className="py-12">
      <div className="mx-auto max-w-5xl px-6">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {trustItems.map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}

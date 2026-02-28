import { ExternalLink } from "lucide-react";
import type { Merchant } from "@/lib/merchants/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function MerchantCard({ merchant }: { merchant: Merchant }) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{merchant.name}</CardTitle>
          <Badge variant={merchant.source === "curated" ? "default" : "secondary"}>
            {merchant.source}
          </Badge>
        </div>
        <CardDescription>{merchant.description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-3">
        <a
          href={merchant.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1 truncate"
        >
          {merchant.url.replace(/^https?:\/\//, "")}
          <ExternalLink className="size-3 shrink-0" />
        </a>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{merchant.category}</Badge>
          {merchant.chains.map((chain) => (
            <Badge key={chain} variant="secondary">
              {chain}
            </Badge>
          ))}
        </div>
        {merchant.pricing && (
          <p className="text-xs text-muted-foreground">{merchant.pricing}</p>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  BookOpen,
} from "lucide-react";
import type { Merchant, Pricing } from "@/lib/merchants/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatPricing(pricing: Pricing): string {
  if ("fixed" in pricing) return `$${pricing.fixed}`;
  if ("min" in pricing && "max" in pricing)
    return `$${pricing.min} – $${pricing.max}`;
  if ("min" in pricing) return `from $${pricing.min}`;
  return `up to $${(pricing as { max: number }).max}`;
}

export function MerchantCard({ merchant }: { merchant: Merchant }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="flex flex-col">
      <CardHeader
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{merchant.name}</CardTitle>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge
              variant={merchant.source === "curated" ? "default" : "secondary"}
            >
              {merchant.source}
            </Badge>
            {expanded ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </div>
        </div>
        <CardDescription>{merchant.description}</CardDescription>
        {(merchant.website || merchant.apiDocs) && (
          <div className="flex items-center gap-2 pt-1">
            {merchant.website && (
              <a
                href={merchant.website}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${merchant.name} website`}
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Globe className="size-4" />
              </a>
            )}
            {merchant.apiDocs && (
              <a
                href={merchant.apiDocs}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${merchant.name} API documentation`}
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <BookOpen className="size-4" />
              </a>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{merchant.category}</Badge>
          {merchant.chains.map((chain) => (
            <Badge key={chain} variant="secondary">
              {chain}
            </Badge>
          ))}
          <Badge variant="secondary">
            {merchant.endpoints.length}{" "}
            {merchant.endpoints.length === 1 ? "endpoint" : "endpoints"}
          </Badge>
        </div>

        {expanded && (
          <div className="flex flex-col gap-2 border-t pt-3">
            {merchant.endpoints.map((ep) => (
              <div
                key={ep.url}
                className="flex flex-col gap-0.5 text-sm"
              >
                <a
                  href={ep.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1 truncate"
                >
                  <span className="truncate">
                    {ep.url.replace(/^https?:\/\//, "")}
                  </span>
                  <ExternalLink className="size-3 shrink-0" />
                </a>
                <p className="text-xs text-muted-foreground">{ep.description}</p>
                {ep.pricing && (
                  <p className="text-xs text-muted-foreground">
                    {formatPricing(ep.pricing)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

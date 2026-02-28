"use client";

import { useState } from "react";
import type { Merchant } from "@/lib/merchants/types";
import { MerchantCard } from "@/components/merchant-card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

export function MerchantDirectoryPublic({
  merchants,
  categories,
}: {
  merchants: Merchant[];
  categories: string[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const filtered = merchants.filter((m) => {
    if (category !== "all" && m.category.toLowerCase() !== category.toLowerCase()) {
      return false;
    }
    if (query) {
      const lower = query.toLowerCase();
      return (
        m.name.toLowerCase().includes(lower) ||
        m.description.toLowerCase().includes(lower) ||
        m.url.toLowerCase().includes(lower)
      );
    }
    return true;
  });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search merchants..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "merchant" : "merchants"} found
      </p>

      {filtered.length > 0 ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((merchant) => (
            <MerchantCard key={merchant.url} merchant={merchant} />
          ))}
        </div>
      ) : (
        <div className="mt-12 text-center">
          <p className="text-muted-foreground">
            No merchants match your search.
          </p>
        </div>
      )}
    </div>
  );
}

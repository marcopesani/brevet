"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import type { Merchant } from "@/lib/merchants/types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MerchantCard } from "@/components/merchant-card";

const ALL_CATEGORIES = "all";

export function MerchantDirectory({
  merchants,
  categories,
}: {
  merchants: Merchant[];
  categories: string[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES);

  const lower = search.toLowerCase();

  const filtered = merchants.filter((m) => {
    if (category !== ALL_CATEGORIES && m.category !== category) return false;
    if (!lower) return true;
    if (
      m.name.toLowerCase().includes(lower) ||
      m.description.toLowerCase().includes(lower)
    )
      return true;
    return m.endpoints.some(
      (ep) =>
        ep.url.toLowerCase().includes(lower) ||
        ep.description.toLowerCase().includes(lower),
    );
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search merchants…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No merchants found.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <MerchantCard key={m.name} merchant={m} />
          ))}
        </div>
      )}
    </div>
  );
}

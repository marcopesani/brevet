import { z } from "zod/v4";

export const MerchantEntrySchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  description: z.string().min(1),
  category: z.enum(["service", "infrastructure", "client", "facilitator"]),
  chains: z.array(z.string()).min(1),
  pricing: z.string().optional(),
});

export type MerchantEntry = z.infer<typeof MerchantEntrySchema>;

export type MerchantSource = "curated" | "bazaar";

export type Merchant = MerchantEntry & { source: MerchantSource };

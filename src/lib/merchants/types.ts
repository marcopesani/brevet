import { z } from "zod/v4";

export const PricingSchema = z.union([
  z.object({ fixed: z.number() }).strict(),
  z.object({ min: z.number(), max: z.number() }).strict(),
  z.object({ min: z.number() }).strict(),
  z.object({ max: z.number() }).strict(),
]);

export type Pricing = z.infer<typeof PricingSchema>;

export const EndpointSchema = z.object({
  url: z.url(),
  description: z.string().min(1),
  pricing: PricingSchema.optional(),
});

export type Endpoint = z.infer<typeof EndpointSchema>;

export const MerchantEntrySchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(["service", "infrastructure", "client", "facilitator"]),
  chains: z.array(z.string()).min(1),
  endpoints: z.array(EndpointSchema).min(1),
});

export type MerchantEntry = z.infer<typeof MerchantEntrySchema>;

export type MerchantSource = "curated" | "bazaar";

export type Merchant = MerchantEntry & { source: MerchantSource };

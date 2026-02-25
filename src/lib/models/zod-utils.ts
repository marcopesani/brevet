import { Types } from "mongoose";
import { z } from "zod/v4";

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

/** Validate a MongoDB ObjectId string. */
export const objectIdStringSchema = z
  .string()
  .regex(OBJECT_ID_REGEX, "Invalid ObjectId");

/** Accept either ObjectId instances or ObjectId strings, output string form. */
export const objectIdLikeSchema = z
  .union([z.instanceof(Types.ObjectId), objectIdStringSchema])
  .transform((value) =>
    value instanceof Types.ObjectId ? value.toString() : value,
  );

/** Validate an ObjectId string and convert to ObjectId instance. */
export function toObjectId(value: string, fieldName: string): Types.ObjectId {
  const parsed = objectIdStringSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid ${fieldName}: expected ObjectId string`);
  }
  return new Types.ObjectId(parsed.data);
}

const dateInputSchema = z.union([z.date(), z.string(), z.number()]);

/** Accept Date/string/number and normalize to Date. */
export const dateLikeSchema = dateInputSchema.transform((value, ctx) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid date",
    });
    return z.NEVER;
  }
  return date;
});

/** Accept Date/string/number/null and normalize to Date|null. */
export const nullableDateLikeSchema = z
  .union([z.null(), dateInputSchema])
  .transform((value, ctx) => {
    if (value === null) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid date",
      });
      return z.NEVER;
    }
    return date;
  });

/** Parse JSON or throw with field-specific context. */
export function parseJsonOrThrow(raw: string, fieldName: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${fieldName}`);
  }
}

/** Parse JSON object with string values (used for stored headers). */
export function parseJsonRecordOrThrow(
  raw: string | null | undefined,
  fieldName: string,
): Record<string, string> {
  if (!raw) return {};
  const parsed = parseJsonOrThrow(raw, fieldName);
  const validated = z.record(z.string(), z.string()).safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Invalid ${fieldName}: expected string key/value object`);
  }
  return validated.data;
}

/** Parse JSON if possible; otherwise keep the original string. */
export function parseJsonWithFallback(
  raw: string | null | undefined,
): unknown | string | null {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}


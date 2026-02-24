import { z } from "zod/v4";
import { Types } from "mongoose";

/**
 * Zod schema for Mongoose ObjectId fields.
 * Accepts ObjectId instances or valid ObjectId strings, transforms to string.
 */
export const objectId = z
  .custom<Types.ObjectId | string>(
    (val) => Types.ObjectId.isValid(val as string | Types.ObjectId),
    "Invalid ObjectId",
  )
  .transform((val) => String(val));

/**
 * Optional objectId — for fields that may be absent (e.g. excluded via .select()).
 */
export const optionalObjectId = objectId.optional();

/**
 * Zod schema for Mongoose Date fields that stay as Date objects.
 * Accepts Date instances and valid date strings.
 */
export const mongoDate = z
  .union([z.date(), z.string().transform((s) => new Date(s))])
  .pipe(z.date());

/**
 * Zod schema for Date fields serialized to ISO strings (for server→client boundary).
 * Accepts Date instances and strings, transforms to ISO-8601 string.
 */
export const dateToIso = z
  .union([z.date(), z.string()])
  .transform((val) => (val instanceof Date ? val.toISOString() : val));

/**
 * Nullable date — for optional date fields that can be null.
 */
export const nullableDate = mongoDate.nullable();

/**
 * Nullable date serialized to ISO string — for optional date fields on server→client boundary.
 */
export const nullableDateToIso = dateToIso.nullable();

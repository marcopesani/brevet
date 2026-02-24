import { z } from "zod/v4";
import { Types } from "mongoose";

/** Mongoose ObjectId → string. */
export const objectId = z
  .custom<Types.ObjectId | string>(
    (val) => Types.ObjectId.isValid(val as string | Types.ObjectId),
    "Invalid ObjectId",
  )
  .transform((val) => String(val));

export const optionalObjectId = objectId.optional();

/** Date fields that stay as Date objects. */
export const mongoDate = z
  .union([z.date(), z.string().transform((s) => new Date(s))])
  .pipe(z.date());

/** Date fields serialized to ISO strings (for server→client boundary). */
export const dateToIso = z
  .union([z.date(), z.string()])
  .transform((val) => (val instanceof Date ? val.toISOString() : val));

export const nullableDate = mongoDate.nullable();
export const nullableDateToIso = dateToIso.nullable();

/** Shared _id → id transform for output schemas. */
export const renameId = <T extends { _id: string }>({ _id, ...rest }: T) =>
  ({ id: _id, ...rest }) as Omit<T, "_id"> & { id: string };

/** Create a type-safe serializer from a Zod schema. */
export function makeSerializer<T extends z.ZodType>(schema: T) {
  return (doc: unknown): z.output<T> => schema.parse(doc);
}

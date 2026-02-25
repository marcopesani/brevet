import { Types } from "mongoose";
import { z } from "zod/v4";

const objectIdPattern = /^[a-fA-F0-9]{24}$/;

export const objectIdStringSchema = z
  .string()
  .regex(objectIdPattern, "Invalid ObjectId format");

export const objectIdSchema = z.instanceof(Types.ObjectId);

export function parseObjectId(value: string, fieldName: string): Types.ObjectId {
  const parsed = objectIdStringSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid ${fieldName}: expected MongoDB ObjectId`);
  }
  return new Types.ObjectId(parsed.data);
}

export function stringifyObjectId(value: Types.ObjectId, fieldName: string): string {
  const parsed = objectIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid ${fieldName}: expected ObjectId instance`);
  }
  return parsed.data.toString();
}

export function parseIsoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return z.iso.datetime().parse(value);
}


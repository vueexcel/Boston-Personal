import { z } from "zod";

/** ISO 8601 UTC datetime string. */
export const isoUtcStringSchema = z.iso.datetime();

/** Primary keys and tenant ids (PostgreSQL `uuid`). */
export const uuidSchema = z.string().uuid();

export const emailSchema = z.string().email().max(320);

export const e164Schema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "Expected E.164 phone number");

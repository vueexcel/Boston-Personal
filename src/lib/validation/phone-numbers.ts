import { z } from "zod";
import { e164Schema, uuidSchema } from "@/lib/db/schema";

export const updatePhoneNumberBodySchema = z.object({
  assignedAgentId: uuidSchema.nullable(),
});

export type UpdatePhoneNumberBody = z.infer<typeof updatePhoneNumberBodySchema>;

export const provisionPhoneNumberBodySchema = z.object({
  phoneNumber: e164Schema,
  assignedAgentId: uuidSchema.nullable().optional(),
});

export type ProvisionPhoneNumberBody = z.infer<
  typeof provisionPhoneNumberBodySchema
>;

const availablePhoneNumberTypeSchema = z.enum([
  "local",
  "toll_free",
  "mobile",
]);

export const availablePhoneNumbersQuerySchema = z.object({
  country: z.string().length(2).default("US"),
  areaCode: z
    .union([z.literal(""), z.string().regex(/^\d{1,5}$/)])
    .optional()
    .default(""),
  numberType: availablePhoneNumberTypeSchema.optional(),
});

export type AvailablePhoneNumberTypeQuery = z.infer<
  typeof availablePhoneNumberTypeSchema
>;

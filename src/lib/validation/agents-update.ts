import { z } from "zod";
import { agentStatusSchema } from "@/lib/db/schema";

/**
 * Partial update for `public.agents` (tenant-scoped).
 * `role_description` stores portal behavior JSON — allow large payloads.
 */
const LONG_TEXT = 500_000;

export const updateAgentBodySchema = z
  .object({
    name: z.string().min(1).max(256).trim().optional(),
    greeting: z.string().max(LONG_TEXT).nullable().optional(),
    roleDescription: z.string().max(LONG_TEXT).nullable().optional(),
    voiceId: z.string().max(512).nullable().optional(),
    voiceProviderId: z.string().max(128).nullable().optional(),
    language: z.string().min(2).max(64).nullable().optional(),
    status: agentStatusSchema.optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, {
    message: "At least one field is required",
  });

export type UpdateAgentBody = z.infer<typeof updateAgentBodySchema>;

import { z } from "zod";
import {
  callLogStatusSchema,
  knowledgeApprovalStatusSchema,
  knowledgeSectionTypeSchema,
  phoneStatusSchema,
  tenantStatusSchema,
  webhookProcessedStatusSchema,
} from "@/lib/db/enums";
import { e164Schema, isoUtcStringSchema, uuidSchema } from "@/lib/db/primitives";

/**
 * Tenant profile shape used by services and Redis cache (camelCase).
 * Maps from `public.tenants` + `settings` jsonb.
 */
export const tenantProfileSchema = z.object({
  tenantId: uuidSchema,
  accountName: z.string().min(0).max(512),
  status: tenantStatusSchema,
  planCode: z.string().min(1).max(64),
  timezone: z.string().min(1).max(64),
  externalId: z.string().min(1).max(128),
  createdAt: isoUtcStringSchema,
  updatedAt: isoUtcStringSchema,
});

export type TenantProfile = z.infer<typeof tenantProfileSchema>;

/** @deprecated Use `TenantProfile` — alias for cache migration. */
export type TenantProfileItem = TenantProfile;

/**
 * Call log row for API responses (camelCase), aligned with `public.call_logs`.
 */
export const callLogItemSchema = z.object({
  callId: uuidSchema,
  tenantId: uuidSchema,
  providerCallId: z.string().min(1).max(128),
  callerNumber: z.string().min(3).max(32),
  dialedNumber: e164Schema,
  agentId: uuidSchema.nullable(),
  status: callLogStatusSchema,
  duration: z.number().int().nonnegative().nullable(),
  disposition: z.string().max(512).nullable(),
  summary: z.string().max(8000).nullable(),
  transcriptUrl: z.string().max(2048).nullable(),
  recordingUrl: z.string().max(2048).nullable(),
  callMinutes: z.number().nonnegative().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  startedAt: isoUtcStringSchema,
  endedAt: isoUtcStringSchema.nullable(),
  createdAt: isoUtcStringSchema,
});

export type CallLogItem = z.infer<typeof callLogItemSchema>;

export const phoneNumberRowSchema = z.object({
  phoneId: uuidSchema,
  tenantId: uuidSchema,
  e164Number: e164Schema,
  twilioSid: z.string().min(1).max(64).nullable(),
  assignedFlowId: uuidSchema.nullable(),
  status: phoneStatusSchema,
  createdAt: isoUtcStringSchema,
  updatedAt: isoUtcStringSchema,
});

export type PhoneNumberRow = z.infer<typeof phoneNumberRowSchema>;

export const knowledgeSectionRowSchema = z.object({
  knowledgeId: uuidSchema,
  tenantId: uuidSchema,
  agentId: uuidSchema.nullable(),
  sectionType: knowledgeSectionTypeSchema,
  title: z.string().min(1).max(512),
  content: z.string().max(200000),
  version: z.number().int().positive(),
  approvalStatus: knowledgeApprovalStatusSchema,
  createdAt: isoUtcStringSchema,
  updatedAt: isoUtcStringSchema,
});

export type KnowledgeSectionRow = z.infer<typeof knowledgeSectionRowSchema>;

export const webhookEventRowSchema = z.object({
  eventId: uuidSchema,
  tenantId: uuidSchema.nullable(),
  providerEventId: z.string().min(1).max(256).nullable(),
  eventType: z.string().min(1).max(128),
  payload: z.record(z.string(), z.unknown()),
  processedStatus: webhookProcessedStatusSchema,
  retryCount: z.number().int().nonnegative(),
  errorMessage: z.string().max(4000).nullable(),
  createdAt: isoUtcStringSchema,
  processedAt: isoUtcStringSchema.nullable(),
});

export type WebhookEventRow = z.infer<typeof webhookEventRowSchema>;

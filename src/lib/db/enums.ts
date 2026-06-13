import { z } from "zod";

export const userRoleSchema = z.enum([
  "PLATFORM_ADMIN",
  "TENANT_ADMIN",
  "TENANT_MANAGER",
  "READ_ONLY",
  "SUPPORT",
]);

export type UserRole = z.infer<typeof userRoleSchema>;

export const tenantStatusSchema = z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]);

export const overagePolicySchema = z.enum(["BLOCK", "ALLOW_WITH_ALERT"]);

export const agentRoleSchema = z.enum([
  "RECEPTIONIST",
  "SALES",
  "SERVICE",
  "ACCOUNTING",
  "AFTER_HOURS",
  "ESCALATION",
]);

export const agentStatusSchema = z.enum(["DRAFT", "ACTIVE", "INACTIVE"]);

/** Matches Postgres enum `kb_section_type` (lowercase). */
export const knowledgeSectionTypeSchema = z.enum([
  "company",
  "service",
  "product",
  "accounting",
  "routing",
  "safety",
]);

export const knowledgeApprovalStatusSchema = z.enum([
  "DRAFT",
  "APPROVED",
  "ACTIVE",
]);

export const phoneStatusSchema = z.enum(["ACTIVE", "INACTIVE", "RELEASED"]);

export const fallbackTypeSchema = z.enum([
  "MESSAGE",
  "PHONE_FORWARD",
  "BOSTEL_SUPPORT",
  "VOICEMAIL",
]);

export const routeTypeSchema = z.enum(["AGENT", "PHONE", "VOICEMAIL"]);

export const callLogStatusSchema = z.enum([
  "INITIATED",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "MISSED",
]);

export const webhookProcessedStatusSchema = z.enum([
  "PENDING",
  "PROCESSED",
  "FAILED",
  "RETRYING",
]);

export const actionTypeSchema = z.enum(["webhook", "api"]);

export const routingTargetTypeSchema = z.enum([
  "phone",
  "voicemail",
  "agent",
]);

export const routingConditionTypeSchema = z.enum([
  "after_hours",
  "intent_match",
  "default",
]);

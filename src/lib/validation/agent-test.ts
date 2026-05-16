import { z } from "zod";
import { agentStatusSchema } from "@/lib/db/schema";
import {
  AGENT_CONFIG_VERSION,
  AGENT_RESPONSIBILITY_IDS,
} from "@/lib/tenant-portal/agent-config-v1";

const LONG_TEXT = 500_000;

export const agentTestPortalConfigSchema = z.object({
  version: z.literal(AGENT_CONFIG_VERSION),
  agentResponsibility: z.enum(AGENT_RESPONSIBILITY_IDS),
  infoToCollect: z.array(z.string()),
  qualifyingQuestions: z.string(),
  knowledgeProducts: z.string().optional(),
  knowledgeFaqs: z.string().optional(),
  knowledgeBaseMode: z.string().optional(),
});

export type AgentTestPortalConfig = z.infer<typeof agentTestPortalConfigSchema>;

export const agentTestDraftSchema = z.object({
  name: z.string().min(1).max(256),
  greeting: z.string().max(LONG_TEXT).nullable().optional(),
  status: agentStatusSchema.optional(),
  voiceId: z.string().max(512).nullable().optional(),
  voiceProviderId: z.string().max(128).nullable().optional(),
  language: z.string().min(2).max(64).nullable().optional(),
  portalConfig: agentTestPortalConfigSchema,
});

export type AgentTestDraft = z.infer<typeof agentTestDraftSchema>;

export const agentTestChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(16_000),
});

export const agentTestChatBodySchema = z.object({
  messages: z.array(agentTestChatMessageSchema).max(100),
  draft: agentTestDraftSchema.optional(),
});

export type AgentTestChatBody = z.infer<typeof agentTestChatBodySchema>;

export const agentTestSyncBodySchema = z.object({
  draft: agentTestDraftSchema.optional(),
});

export type AgentTestSyncBody = z.infer<typeof agentTestSyncBodySchema>;

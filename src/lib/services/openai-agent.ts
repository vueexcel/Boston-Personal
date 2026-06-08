import { z } from "zod";
import { getOpenAIClient } from "@/lib/integrations/openai";
import { getServerEnv } from "@/lib/env/server";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { parseAgentPortalConfig } from "@/lib/tenant-portal/agent-config-v1";
import type { AgentTestDraft } from "@/lib/validation/agent-test";
import { getAgentForTenant } from "@/lib/services/agents";
import type { AgentDetail } from "@/lib/services/agents";
import { loadKnowledgeBaseDocumentsForPrompt } from "@/lib/services/knowledge-documents";
import {
  buildBehaviourBlockFromConfig,
  buildFullSystemPrompt,
  formatKnowledgeBaseDocuments,
  type AgentAdvancedSettingsForPrompt,
  type KnowledgeSectionForPrompt,
} from "@/lib/services/prompt-assembler";

/** Post-call analysis payload from {@link summarizeCall}. */
export const callSentimentSchema = z.enum([
  "positive",
  "neutral",
  "negative",
  "mixed",
]);

export type CallSentiment = z.infer<typeof callSentimentSchema>;

export const callSummarySchema = z.object({
  summary: z.string(),
  sentiment: callSentimentSchema,
  action_items: z.array(z.string()),
});

export type CallSummary = z.infer<typeof callSummarySchema>;

type KnowledgeSectionRow = KnowledgeSectionForPrompt;
type AgentAdvancedSettingsRow = AgentAdvancedSettingsForPrompt;

/**
 * Loads active knowledge sections for an agent (tenant-wide + agent-scoped).
 */
async function loadActiveKnowledgeSections(
  tenantId: string,
  agentId: string,
): Promise<KnowledgeSectionRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("knowledge_sections")
    .select(
      "id, tenant_id, agent_id, type, title, content, approval_status",
    )
    .eq("tenant_id", tenantId)
    .eq("approval_status", "ACTIVE")
    .is("deleted_at", null)
    .or(`agent_id.is.null,agent_id.eq.${agentId}`)
    .order("type", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    throw new Error(`Failed to load knowledge sections: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    agentId:
      row.agent_id != null && typeof row.agent_id === "string"
        ? row.agent_id
        : null,
    type: String(row.type),
    title: String(row.title),
    content: String(row.content),
    approvalStatus: String(row.approval_status),
  }));
}

async function loadAgentAdvancedSettings(
  tenantId: string,
  agentId: string,
): Promise<AgentAdvancedSettingsRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("agent_advanced_settings")
    .select("safety_guardrails, model_name")
    .eq("tenant_id", tenantId)
    .eq("agent_id", agentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;

  const raw = data.safety_guardrails;
  const safetyGuardrails =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  return {
    safetyGuardrails,
    modelName:
      typeof data.model_name === "string" ? data.model_name : null,
  };
}

function buildBehaviourBlock(agent: AgentDetail): string {
  const { config } = parseAgentPortalConfig(agent.roleDescription);
  return buildBehaviourBlockFromConfig(config, {
    greeting: agent.greeting,
    voiceId: agent.voiceId,
    voiceProviderId: agent.voiceProviderId,
    language: agent.language,
  });
}

async function loadKnowledgeBasePromptBlock(
  tenantId: string,
  knowledgeBaseId: string | null | undefined,
): Promise<string | null> {
  if (!knowledgeBaseId?.trim()) return null;
  const payload = await loadKnowledgeBaseDocumentsForPrompt(
    tenantId,
    knowledgeBaseId.trim(),
  );
  if (!payload) return null;
  return formatKnowledgeBaseDocuments(payload);
}

export type GenerateSystemPromptResult = {
  prompt: string;
  tenantId: string;
  agentId: string;
};

export type GenerateSystemPromptOptions = {
  /** When false, skips inserting into `agent_prompts`. Default true. */
  persist?: boolean;
};

/**
 * Builds the full system prompt from unsaved portal editor values (test / preview).
 */
export async function buildSystemPromptForDraft(
  tenantId: string,
  agentId: string,
  draft: AgentTestDraft,
): Promise<string> {
  const knowledgeSections = await loadActiveKnowledgeSections(
    tenantId,
    agentId,
  );
  const advanced = await loadAgentAdvancedSettings(tenantId, agentId);
  const behaviour = buildBehaviourBlockFromConfig(draft.portalConfig, {
    greeting: draft.greeting ?? null,
    voiceId: draft.voiceId ?? null,
    voiceProviderId: draft.voiceProviderId ?? null,
    language: draft.language ?? null,
  });
  const knowledgeBaseBlock = await loadKnowledgeBasePromptBlock(
    tenantId,
    draft.portalConfig.knowledgeBaseId,
  );
  return buildFullSystemPrompt(
    behaviour,
    knowledgeSections,
    advanced,
    knowledgeBaseBlock,
  );
}

/**
 * Resolves system prompt from saved DB state or optional draft.
 */
export async function resolveSystemPromptForAgent(
  tenantId: string,
  agentId: string,
  options?: { draft?: AgentTestDraft; persist?: boolean },
): Promise<string> {
  if (options?.draft) {
    return buildSystemPromptForDraft(tenantId, agentId, options.draft);
  }
  const generated = await generateSystemPrompt(agentId, {
    persist: options?.persist,
  });
  return generated.prompt;
}

/**
 * Builds the full system prompt for an agent from Supabase behaviour, voice hints,
 * and active knowledge sections. Returns markdown with `# Role`, `# Knowledge`,
 * and `# Guardrails` sections.
 */
export async function generateSystemPrompt(
  agentId: string,
  options?: GenerateSystemPromptOptions,
): Promise<GenerateSystemPromptResult> {
  const supabase = createServerSupabase();
  const { data: agentRow, error: agentLookupError } = await supabase
    .from("agents")
    .select("tenant_id")
    .eq("id", agentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (agentLookupError || !agentRow?.tenant_id) {
    throw new Error("Agent not found");
  }

  const tenantId = String(agentRow.tenant_id);
  const agent = await getAgentForTenant(tenantId, agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  const knowledgeSections = await loadActiveKnowledgeSections(
    tenantId,
    agentId,
  );
  const advanced = await loadAgentAdvancedSettings(tenantId, agentId);

  const behaviour = buildBehaviourBlock(agent);
  const { config } = parseAgentPortalConfig(agent.roleDescription);
  const knowledgeBaseBlock = await loadKnowledgeBasePromptBlock(
    tenantId,
    config.knowledgeBaseId,
  );
  const prompt = buildFullSystemPrompt(
    behaviour,
    knowledgeSections,
    advanced,
    knowledgeBaseBlock,
  );

  if (options?.persist !== false) {
    await persistAgentPromptVersion(tenantId, agentId, prompt);
  }

  return { prompt, tenantId, agentId };
}

async function persistAgentPromptVersion(
  tenantId: string,
  agentId: string,
  content: string,
): Promise<void> {
  const supabase = createServerSupabase();
  const { data: latest } = await supabase
    .from("agent_prompts")
    .select("version")
    .eq("agent_id", agentId)
    .is("deleted_at", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion =
    latest?.version != null && typeof latest.version === "number"
      ? latest.version + 1
      : 1;

  const { error } = await supabase.from("agent_prompts").insert({
    tenant_id: tenantId,
    agent_id: agentId,
    content,
    version: nextVersion,
  });

  if (error) {
    throw new Error(`Failed to persist agent prompt version: ${error.message}`);
  }
}

const SUMMARIZE_SYSTEM = `You analyze phone call transcripts for a business voice AI platform.
Return JSON only with keys: summary (string, 2-4 sentences), sentiment (one of: positive, neutral, negative, mixed), action_items (array of short strings).
Be factual; use only what appears in the transcript.`;

/**
 * Uses OpenAI GPT-4o to produce a structured post-call summary.
 */
export async function summarizeCall(transcript: string): Promise<CallSummary> {
  const trimmed = transcript.trim();
  if (!trimmed) {
    throw new Error("Transcript is empty");
  }

  const env = getServerEnv();
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const client = getOpenAIClient();
  const model = env.OPENAI_MODEL?.trim() || "gpt-4o";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SUMMARIZE_SYSTEM },
      {
        role: "user",
        content: `Transcript:\n\n${trimmed}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenAI returned an empty summary");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("OpenAI summary was not valid JSON");
  }

  const result = callSummarySchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `OpenAI summary failed validation: ${result.error.message}`,
    );
  }

  return result.data;
}

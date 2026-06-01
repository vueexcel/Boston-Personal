import { z } from "zod";
import { getElevenLabsClient } from "@/lib/integrations/elevenlabs";
import { convaiAgentLanguageField } from "@/lib/integrations/elevenlabs-convai-language";
import {
  convaiTtsConfig,
  resolveConvaiTtsVoiceId,
} from "@/lib/services/elevenlabs-voice-resolve";
import { getOpenAIClient } from "@/lib/integrations/openai";
import { getServerEnv } from "@/lib/env/server";
import { createServerSupabase } from "@/lib/db/supabase-server";
import {
  AGENT_RESPONSIBILITY_LABELS,
  parseAgentPortalConfig,
  type AgentPortalConfigV1,
  type AgentResponsibilityId,
} from "@/lib/tenant-portal/agent-config-v1";
import type { AgentTestDraft } from "@/lib/validation/agent-test";
import { getAgentForTenant } from "@/lib/services/agents";
import type { AgentDetail } from "@/lib/services/agents";
import { loadKnowledgeBaseDocumentsForPrompt } from "@/lib/services/knowledge-documents";
import type { KnowledgeBaseDocumentForPrompt } from "@/lib/services/knowledge-documents";

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

type KnowledgeSectionRow = {
  id: string;
  tenantId: string;
  agentId: string | null;
  type: string;
  title: string;
  content: string;
  approvalStatus: string;
};

type AgentAdvancedSettingsRow = {
  safetyGuardrails: Record<string, unknown>;
  modelName: string | null;
};

const SECTION_TYPE_LABELS: Record<string, string> = {
  company: "Company",
  service: "Services",
  product: "Products and services",
  accounting: "Accounting",
  routing: "Routing",
  safety: "Safety and compliance",
};

const DEFAULT_BEHAVIOUR_RULES = `**Rules:**
- Ask only ONE question at a time. Wait for the caller to respond before asking the next.
- FEE DISCLOSURE: If the caller describes a situation that matches a service with an additional fee or surcharge listed in BUSINESS FACTS AND FAQS (e.g., emergency call-out fee), you MUST disclose that fee before collecting their details or proceeding with the booking. Do not skip fee disclosure to save time — the caller must be informed upfront.
- STRICT HOURS & DAYS ENFORCEMENT: Before confirming ANY time-based request (reservation, appointment, callback, delivery, etc.), check BOTH the days of operation AND the exact opening/closing times in BUSINESS FACTS AND FAQS. If the requested day or time is even one minute outside those hours, REJECT it immediately — do NOT accept it, do NOT round it to the nearest valid time, and do NOT say "that works" only to correct yourself later. State the valid days and time window and ask the caller to pick within it.
- STRICT SERVICES ENFORCEMENT: If a caller asks about a service, product, or capability NOT listed in PRODUCTS AND SERVICES, do NOT say "yes", "sure", or "we can do that." Say you don't currently offer that and offer the closest alternative from PRODUCTS AND SERVICES if one exists, otherwise ask for email or phone number and tell them they will be contacted with more details.
- STRICT FACTS ENFORCEMENT: When answering ANY factual question (hours, pricing, policies, location, menu items, etc.), use ONLY information explicitly stated in BUSINESS FACTS AND FAQS and PRODUCTS AND SERVICES. If the answer is not there, say you don't have that information and offer to have someone from the team follow up. NEVER guess, approximate, or invent details — no "probably", "around", "I think", or "usually".
- NO INVENTED PROMOTIONS: Never offer discounts, special deals, free upgrades, or promotions unless they are explicitly listed in BUSINESS FACTS AND FAQS or PRODUCTS AND SERVICES. Do not make up incentives to close a sale or make the caller happy.
- NO FALSE CONFIRMATIONS: You are collecting information on behalf of the business — you do NOT have direct access to booking systems, calendars, or inventory. Never say "you're all set", "confirmed", or "booked" unless the system explicitly tells you the action succeeded. Instead, say the request has been noted and the team will confirm.
- Only handle requests that match a use case in USE CASES. For anything outside your scope, use the response from SCOPE.
- When collecting information, only ask for items listed in COLLECT. Do not invent additional requirements.
- SELF-CONSISTENCY: Never contradict something you already said in the same call. If you stated a fact (e.g., closing time, a policy, a price), do not accept or agree to something that violates it moments later. If the caller challenges you and you were correct, hold your ground politely.`;

const DEFAULT_COMPLIANCE_GUARDRAILS = `- Stay within approved knowledge and behaviour rules at all times.
- Do not collect payment card numbers or full bank details on the call unless explicitly listed in COLLECT.
- Escalate abusive, threatening, or emergency situations per SCOPE and routing instructions.
- Do not provide legal, medical, or financial advice beyond what is written in BUSINESS FACTS AND FAQS.`;

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

function readStringFromGuardrails(
  guardrails: Record<string, unknown>,
  key: string,
): string | null {
  const v = guardrails[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Resolves the ElevenLabs Conversational AI agent id linked to a Bostel agent.
 * Stored in `agent_advanced_settings.safety_guardrails.elevenlabs_convai_agent_id`.
 */
export async function getElevenLabsConvaiAgentId(
  tenantId: string,
  agentId: string,
): Promise<string | null> {
  const settings = await loadAgentAdvancedSettings(tenantId, agentId);
  if (!settings) return null;
  return readStringFromGuardrails(
    settings.safetyGuardrails,
    "elevenlabs_convai_agent_id",
  );
}

function formatKnowledgeSections(sections: KnowledgeSectionRow[]): string {
  if (sections.length === 0) {
    return "(No active knowledge sections in the database.)";
  }

  const blocks: string[] = [];
  for (const s of sections) {
    const label = SECTION_TYPE_LABELS[s.type] ?? s.type;
    const scope =
      s.agentId == null ? "tenant-wide" : "agent-specific";
    blocks.push(
      `### ${label} — ${s.title} (${scope})\n\n${s.content.trim()}`,
    );
  }
  return blocks.join("\n\n");
}

type BehaviourFields = {
  greeting: string | null;
  voiceId: string | null;
  voiceProviderId: string | null;
  language: string | null;
};

function buildBehaviourBlockFromConfig(
  config: AgentPortalConfigV1,
  fields: BehaviourFields,
): string {
  const responsibility =
    AGENT_RESPONSIBILITY_LABELS[
      config.agentResponsibility as AgentResponsibilityId
    ] ?? config.agentResponsibility;

  const collect =
    config.infoToCollect.length > 0
      ? config.infoToCollect.map((x) => `- ${x}`).join("\n")
      : "- (none specified)";

  const products = (config.knowledgeProducts ?? "").trim();
  const faqs = (config.knowledgeFaqs ?? "").trim();

  const voiceLine =
    fields.voiceId && fields.voiceProviderId
      ? `Use voice provider \`${fields.voiceProviderId}\` with voice id \`${fields.voiceId}\` when speech is synthesized.`
      : fields.voiceId
        ? `Preferred voice id: \`${fields.voiceId}\`.`
        : "(No voice id configured.)";

  return [
    "### BEHAVIOUR",
    "",
    DEFAULT_BEHAVIOUR_RULES,
    "",
    "**Agent responsibility (USE CASES):**",
    responsibility,
    "",
    "**Greeting / first message:**",
    (fields.greeting ?? "").trim() || "(not set)",
    "",
    "**Information to collect (COLLECT):**",
    collect,
    "",
    "**Qualifying questions:**",
    config.qualifyingQuestions.trim() || "(not set)",
    "",
    "**SCOPE:**",
    "Politely decline requests outside the use case above. Offer a callback or human follow-up when appropriate.",
    "",
    "**PRODUCTS AND SERVICES (portal draft):**",
    products || "(empty)",
    "",
    "**BUSINESS FACTS AND FAQS (portal draft):**",
    faqs || "(empty)",
    "",
    "**Voice settings:**",
    voiceLine,
    fields.language ? `Language/locale hint: ${fields.language}` : "",
  ]
    .filter(Boolean)
    .join("\n");
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

function formatKnowledgeBaseDocuments(
  payload: KnowledgeBaseDocumentForPrompt,
): string {
  if (payload.documents.length === 0) {
    return `### Knowledge base: ${payload.knowledgeBaseName}\n\n(No documents in this knowledge base.)`;
  }
  const blocks = payload.documents.map((doc, index) => {
    const label = `Document ${index + 1}`;
    return `### ${label}\n\n${doc.content.trim()}`;
  });
  return [`### Knowledge base: ${payload.knowledgeBaseName}`, "", ...blocks].join(
    "\n\n",
  );
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

function assembleFullSystemPrompt(
  behaviour: string,
  knowledgeSections: KnowledgeSectionRow[],
  advanced: AgentAdvancedSettingsRow | null,
  knowledgeBaseBlock?: string | null,
): string {
  const sectionKnowledge = formatKnowledgeSections(
    knowledgeSections.filter((s) => s.type !== "safety"),
  );
  const knowledgeParts = [sectionKnowledge];
  if (knowledgeBaseBlock?.trim()) {
    knowledgeParts.push("", knowledgeBaseBlock.trim());
  }
  const knowledgeDb = knowledgeParts.join("\n");
  const guardrails = buildGuardrailsBlock(knowledgeSections, advanced);
  return [
    "# Role",
    "",
    behaviour,
    "",
    "# Knowledge",
    "",
    knowledgeDb,
    "",
    "# Guardrails",
    "",
    guardrails,
  ].join("\n");
}

function buildGuardrailsBlock(
  knowledgeSections: KnowledgeSectionRow[],
  advanced: AgentAdvancedSettingsRow | null,
): string {
  const custom = advanced
    ? readStringFromGuardrails(advanced.safetyGuardrails, "compliance_rules")
    : null;

  const safetySections = knowledgeSections.filter((s) => s.type === "safety");
  const safetyText =
    safetySections.length > 0
      ? safetySections
          .map((s) => `### ${s.title}\n\n${s.content.trim()}`)
          .join("\n\n")
      : "";

  const parts = [custom ?? DEFAULT_COMPLIANCE_GUARDRAILS];
  if (safetyText) {
    parts.push("", "**Knowledge base (safety):**", safetyText);
  }
  return parts.join("\n");
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
  return assembleFullSystemPrompt(
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
  const prompt = assembleFullSystemPrompt(
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

export type SyncElevenLabsAgentPromptOptions = {
  /** ElevenLabs Conversational AI agent id (`agent_…`). Defaults to stored link. */
  elevenLabsAgentId?: string;
  /** When true, regenerates the prompt from Supabase before syncing. Default true. */
  regenerate?: boolean;
  /** When set, builds prompt from editor draft instead of saved agent row. */
  draft?: AgentTestDraft;
  /** Passed to {@link generateSystemPrompt} when regenerating without draft. */
  persist?: boolean;
};

export type SyncElevenLabsAgentPromptResult = {
  elevenLabsAgentId: string;
  prompt: string;
  resolvedVoiceId?: string | null;
  voiceWarning?: string;
};

/**
 * Syncs the generated system prompt to ElevenLabs Conversational AI
 * (`PATCH /v1/convai/agents/{agent_id}`).
 */
async function loadLatestPersistedPrompt(
  tenantId: string,
  agentId: string,
): Promise<string | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("agent_prompts")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("agent_id", agentId)
    .is("deleted_at", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.content || typeof data.content !== "string") {
    return null;
  }
  return data.content;
}

export async function syncAgentPromptToElevenLabs(
  bostelAgentId: string,
  options: SyncElevenLabsAgentPromptOptions = {},
): Promise<SyncElevenLabsAgentPromptResult> {
  const regenerate = options.regenerate !== false;
  let prompt: string;
  let tenantId: string;
  let agentId: string;

  if (options.draft) {
    const supabase = createServerSupabase();
    const { data: agentRow, error: agentLookupError } = await supabase
      .from("agents")
      .select("tenant_id")
      .eq("id", bostelAgentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (agentLookupError || !agentRow?.tenant_id) {
      throw new Error("Agent not found");
    }

    tenantId = String(agentRow.tenant_id);
    agentId = bostelAgentId;
    prompt = await buildSystemPromptForDraft(
      tenantId,
      agentId,
      options.draft,
    );
  } else if (regenerate) {
    const generated = await generateSystemPrompt(bostelAgentId, {
      persist: options.persist,
    });
    prompt = generated.prompt;
    tenantId = generated.tenantId;
    agentId = generated.agentId;
  } else {
    const supabase = createServerSupabase();
    const { data: agentRow, error: agentLookupError } = await supabase
      .from("agents")
      .select("tenant_id")
      .eq("id", bostelAgentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (agentLookupError || !agentRow?.tenant_id) {
      throw new Error("Agent not found");
    }

    tenantId = String(agentRow.tenant_id);
    agentId = bostelAgentId;
    const existing = await loadLatestPersistedPrompt(tenantId, agentId);
    if (!existing) {
      const generated = await generateSystemPrompt(bostelAgentId);
      prompt = generated.prompt;
    } else {
      prompt = existing;
    }
  }

  const elevenLabsAgentId =
    options.elevenLabsAgentId ??
    (await getElevenLabsConvaiAgentId(tenantId, agentId));

  if (!elevenLabsAgentId) {
    throw new Error(
      "No ElevenLabs Conversational AI agent id linked. Set agent_advanced_settings.safety_guardrails.elevenlabs_convai_agent_id for this agent.",
    );
  }

  const agent = await getAgentForTenant(tenantId, agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  const greeting =
    options.draft?.greeting !== undefined
      ? options.draft.greeting
      : agent.greeting;
  const voiceId =
    options.draft?.voiceId !== undefined ? options.draft.voiceId : agent.voiceId;
  const language =
    options.draft?.language !== undefined
      ? options.draft.language
      : agent.language;

  const resolvedVoice = await resolveConvaiTtsVoiceId(voiceId);

  const client = getElevenLabsClient();

  await client.conversationalAi.agents.update(elevenLabsAgentId, {
    conversationConfig: {
      agent: {
        firstMessage: greeting?.trim() || undefined,
        prompt: {
          prompt,
        },
        ...convaiAgentLanguageField(language),
      },
      ...convaiTtsConfig(resolvedVoice.voiceId),
    },
  });

  return {
    elevenLabsAgentId,
    prompt,
    resolvedVoiceId: resolvedVoice.voiceId,
    voiceWarning: resolvedVoice.warning,
  };
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

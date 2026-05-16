import { getElevenLabsClient } from "@/lib/integrations/elevenlabs";
import { convaiAgentLanguageField } from "@/lib/integrations/elevenlabs-convai-language";
import { getServerEnv } from "@/lib/env/server";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { getAgentForTenant } from "@/lib/services/agents";
import {
  getElevenLabsConvaiAgentId,
  resolveSystemPromptForAgent,
  syncAgentPromptToElevenLabs,
} from "@/lib/services/openai-agent";
import {
  convaiTtsConfig,
  resolveConvaiTtsVoiceId,
} from "@/lib/services/elevenlabs-voice-resolve";
import type { AgentTestDraft } from "@/lib/validation/agent-test";

async function upsertConvaiAgentId(
  tenantId: string,
  agentId: string,
  elevenLabsAgentId: string,
): Promise<void> {
  const supabase = createServerSupabase();
  const { data: existing } = await supabase
    .from("agent_advanced_settings")
    .select("id, safety_guardrails")
    .eq("tenant_id", tenantId)
    .eq("agent_id", agentId)
    .is("deleted_at", null)
    .maybeSingle();

  const prior =
    existing?.safety_guardrails &&
    typeof existing.safety_guardrails === "object" &&
    !Array.isArray(existing.safety_guardrails)
      ? (existing.safety_guardrails as Record<string, unknown>)
      : {};

  const safetyGuardrails = {
    ...prior,
    elevenlabs_convai_agent_id: elevenLabsAgentId,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("agent_advanced_settings")
      .update({ safety_guardrails: safetyGuardrails })
      .eq("id", existing.id);
    if (error) {
      throw new Error(`Failed to store ConvAI agent id: ${error.message}`);
    }
    return;
  }

  const { error } = await supabase.from("agent_advanced_settings").insert({
    tenant_id: tenantId,
    agent_id: agentId,
    safety_guardrails: safetyGuardrails,
  });
  if (error) {
    throw new Error(`Failed to store ConvAI agent id: ${error.message}`);
  }
}

/**
 * Returns an existing ElevenLabs ConvAI agent id or creates one and links it in Supabase.
 */
export async function ensureConvaiAgentForBostelAgent(
  tenantId: string,
  agentId: string,
  draft?: AgentTestDraft,
): Promise<string> {
  const env = getServerEnv();
  if (!env.ELEVENLABS_API_KEY?.trim()) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const existing = await getElevenLabsConvaiAgentId(tenantId, agentId);
  if (existing) return existing;

  const agent = await getAgentForTenant(tenantId, agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  const prompt = await resolveSystemPromptForAgent(tenantId, agentId, {
    draft,
    persist: false,
  });

  const greeting =
    draft?.greeting !== undefined ? draft.greeting : agent.greeting;
  const voiceId = draft?.voiceId !== undefined ? draft.voiceId : agent.voiceId;
  const language =
    draft?.language !== undefined ? draft.language : agent.language;
  const displayName = draft?.name?.trim() || agent.name;

  const resolvedVoice = await resolveConvaiTtsVoiceId(voiceId);

  const client = getElevenLabsClient();
  const created = await client.conversationalAi.agents.create({
    name: displayName,
    conversationConfig: {
      agent: {
        firstMessage: greeting?.trim() || undefined,
        prompt: { prompt },
        ...convaiAgentLanguageField(language),
      },
      ...convaiTtsConfig(resolvedVoice.voiceId),
    },
  });

  const elevenLabsAgentId = created.agentId;
  if (!elevenLabsAgentId) {
    throw new Error("ElevenLabs did not return an agent id");
  }

  await upsertConvaiAgentId(tenantId, agentId, elevenLabsAgentId);
  return elevenLabsAgentId;
}

export async function getConvaiSignedUrl(
  elevenLabsAgentId: string,
): Promise<string> {
  const env = getServerEnv();
  if (!env.ELEVENLABS_API_KEY?.trim()) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const client = getElevenLabsClient();
  const result = await client.conversationalAi.conversations.getSignedUrl({
    agentId: elevenLabsAgentId,
  });

  const signedUrl = result.signedUrl;
  if (!signedUrl) {
    throw new Error("ElevenLabs did not return a signed URL");
  }
  return signedUrl;
}

export type PrepareAgentVoiceTestResult = {
  elevenLabsAgentId: string;
  signedUrl: string;
  voiceWarning?: string;
  resolvedVoiceId?: string | null;
};

/**
 * Ensures ConvAI agent exists, syncs latest prompt, returns signed URL for browser session.
 */
export async function prepareAgentVoiceTest(
  tenantId: string,
  agentId: string,
  draft?: AgentTestDraft,
): Promise<PrepareAgentVoiceTestResult> {
  const elevenLabsAgentId = await ensureConvaiAgentForBostelAgent(
    tenantId,
    agentId,
    draft,
  );

  const synced = await syncAgentPromptToElevenLabs(agentId, {
    elevenLabsAgentId,
    regenerate: false,
    draft,
    persist: false,
  });

  const signedUrl = await getConvaiSignedUrl(elevenLabsAgentId);
  return {
    elevenLabsAgentId,
    signedUrl,
    voiceWarning: synced.voiceWarning,
    resolvedVoiceId: synced.resolvedVoiceId,
  };
}

import { createServerSupabase } from "@/lib/db/supabase-server";
import { getOpenAIClient } from "@/lib/integrations/openai";
import { getServerEnv } from "@/lib/env/server";
import { resolveSystemPromptForAgent } from "@/lib/services/openai-agent";
import { resolveConvaiTtsVoiceId } from "@/lib/services/elevenlabs-voice-resolve";
import { getAgentForTenant } from "@/lib/services/agents";
import { resolveLocalizedGreeting } from "@/lib/services/greeting-translate";
import { screenRuntimeUserMessage } from "@/lib/prompt-content-safety-patterns";
import { buildPhoneConversationStyleBlock } from "@/lib/services/prompt-assembler";
import { SentenceBuffer } from "@/lib/voice/sentence-buffer";
import { TtsSentenceMerger } from "@/lib/voice/tts-text";
import {
  formatCollectedInfoBlock,
  type CollectedInfoMap,
} from "@/lib/services/call-collected-info";
import {
  formatConversationStateBlock,
  type CallConversationState,
} from "@/lib/services/call-conversation-state";
import { parseAgentPortalConfig } from "@/lib/tenant-portal/agent-config-v1";
import { getVoiceOpenAiModel } from "@/lib/voice/voice-tuning";
import type { AgentTestDraft } from "@/lib/validation/agent-test";
import type { AgentDetail } from "@/lib/services/agents";

export type CallChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CallAgentSnapshot = {
  tenantId: string;
  agentId: string;
  agentName: string;
  systemPrompt: string;
  greeting: string | null;
  voiceId: string;
  voiceGender: string | null;
  language: string | null;
  maxDurationSec: number;
  sttLanguage: string;
  infoToCollect: string[];
};

function genderPersonaPhrase(gender: string | null): string | null {
  if (!gender?.trim()) return null;
  const g = gender.trim().toLowerCase();
  if (g === "female") return "Speak as a female assistant (matches your synthesized voice).";
  if (g === "male") return "Speak as a male assistant (matches your synthesized voice).";
  if (g === "neutral") {
    return "Use a neutral, professional tone (matches your synthesized voice).";
  }
  return null;
}

export function buildVoicePersonaBlock(snapshot: CallAgentSnapshot): string {
  const lines: string[] = ["# Voice persona"];
  if (snapshot.agentName.trim()) {
    lines.push(
      `- Your name on this call: ${snapshot.agentName.trim()}`,
    );
  }
  const genderLine = genderPersonaPhrase(snapshot.voiceGender);
  if (genderLine) lines.push(`- ${genderLine}`);
  lines.push(
    "- Use consistent first-person pronouns (I/me/my) matching this persona.",
    "- Do not claim you have no name or gender unless the caller explicitly asks you to clarify you are automated.",
  );
  return lines.join("\n");
}

const DEFAULT_MAX_DURATION_SEC = 600;
export const VOICE_MAX_TOKENS = 120;
export const VOICE_TEMPERATURE = 0.55;

function mapLanguageToStt(language: string | null): string {
  if (!language?.trim()) return "en-US";
  const l = language.trim();
  if (l.toLowerCase().startsWith("en")) return "en-US";
  return l;
}

export function resolveInfoToCollect(
  agent: AgentDetail,
  draft?: AgentTestDraft,
): string[] {
  if (draft?.portalConfig?.infoToCollect) {
    return draft.portalConfig.infoToCollect.filter((s) => s.trim());
  }
  const { config } = parseAgentPortalConfig(agent.roleDescription);
  return config.infoToCollect.filter((s) => s.trim());
}

export function buildVoiceSystemPrompt(
  snapshot: CallAgentSnapshot,
  collectedInfo?: CollectedInfoMap,
  conversationState?: CallConversationState | null,
): string {
  const collectedBlock = formatCollectedInfoBlock(
    snapshot.infoToCollect,
    collectedInfo ?? {},
  );
  const stateBlock = formatConversationStateBlock(conversationState);
  const parts = [
    snapshot.systemPrompt,
    buildPhoneConversationStyleBlock(),
    buildVoicePersonaBlock(snapshot),
    collectedBlock,
    stateBlock,
    `[tenant=${snapshot.tenantId}]`,
  ].filter((p) => p.trim());
  return parts.join("\n\n");
}

export type LoadTestAgentContextResult = {
  snapshot: CallAgentSnapshot;
  voiceWarning?: string;
};

async function resolveMaxDurationSec(
  tenantId: string,
  agentId: string,
): Promise<number> {
  const supabase = createServerSupabase();
  const { data: settings } = await supabase
    .from("agent_advanced_settings")
    .select("max_duration")
    .eq("tenant_id", tenantId)
    .eq("agent_id", agentId)
    .is("deleted_at", null)
    .maybeSingle();

  let maxDurationSec = DEFAULT_MAX_DURATION_SEC;
  if (
    settings?.max_duration != null &&
    typeof settings.max_duration === "number"
  ) {
    maxDurationSec = Math.max(60, Math.min(settings.max_duration, 3600));
  }
  return maxDurationSec;
}

/**
 * Loads agent configuration for portal voice/text tests (supports unsaved drafts).
 */
export async function loadTestAgentContext(
  tenantId: string,
  agentId: string,
  draft?: AgentTestDraft,
): Promise<LoadTestAgentContextResult> {
  const agent = await getAgentForTenant(tenantId, agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  const systemPrompt = await resolveSystemPromptForAgent(tenantId, agentId, {
    draft,
    persist: false,
  });

  const voiceId =
    draft?.voiceId !== undefined ? draft.voiceId : agent.voiceId;
  const language =
    draft?.language !== undefined ? draft.language : agent.language;
  const greeting =
    draft?.greeting !== undefined ? draft.greeting : agent.greeting;

  const resolvedVoice = await resolveConvaiTtsVoiceId(voiceId);
  if (!resolvedVoice.voiceId) {
    throw new Error(
      resolvedVoice.warning ??
        "No valid ElevenLabs voice configured for this agent.",
    );
  }

  const maxDurationSec = await resolveMaxDurationSec(tenantId, agentId);

  const localizedGreeting = await resolveLocalizedGreeting({
    text: greeting,
    targetLanguage: language,
  });

  return {
    snapshot: {
      tenantId,
      agentId,
      agentName: agent.name,
      systemPrompt,
      greeting: localizedGreeting,
      voiceId: resolvedVoice.voiceId,
      voiceGender: resolvedVoice.voiceGender ?? null,
      language,
      maxDurationSec,
      sttLanguage: mapLanguageToStt(language),
      infoToCollect: resolveInfoToCollect(agent, draft),
    },
    voiceWarning: resolvedVoice.warning,
  };
}

function buildOpenAiMessages(
  snapshot: CallAgentSnapshot,
  messages: CallChatMessage[],
  userText: string,
  collectedInfo?: CollectedInfoMap,
  conversationState?: CallConversationState | null,
): { role: "system" | "user" | "assistant"; content: string }[] {
  const openAiMessages: {
    role: "system" | "user" | "assistant";
    content: string;
  }[] = [
    {
      role: "system",
      content: buildVoiceSystemPrompt(
        snapshot,
        collectedInfo,
        conversationState,
      ),
    },
  ];

  for (const m of messages) {
    openAiMessages.push({ role: m.role, content: m.content });
  }
  openAiMessages.push({ role: "user", content: userText.trim() });
  return openAiMessages;
}

/**
 * Loads frozen agent configuration for a live Twilio call (saved DB only).
 */
export async function loadCallAgentContext(
  tenantId: string,
  agentId: string,
): Promise<CallAgentSnapshot> {
  const agent = await getAgentForTenant(tenantId, agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }
  if (agent.status !== "ACTIVE") {
    throw new Error("Agent is not active");
  }

  const systemPrompt = await resolveSystemPromptForAgent(tenantId, agentId, {
    persist: false,
  });

  const resolvedVoice = await resolveConvaiTtsVoiceId(agent.voiceId);
  if (!resolvedVoice.voiceId) {
    throw new Error(
      resolvedVoice.warning ??
        "No valid ElevenLabs voice configured for this agent.",
    );
  }

  const maxDurationSec = await resolveMaxDurationSec(tenantId, agentId);

  const localizedGreeting = await resolveLocalizedGreeting({
    text: agent.greeting,
    targetLanguage: agent.language,
  });

  return {
    tenantId,
    agentId,
    agentName: agent.name,
    systemPrompt,
    greeting: localizedGreeting,
    voiceId: resolvedVoice.voiceId,
    voiceGender: resolvedVoice.voiceGender ?? null,
    language: agent.language,
    maxDurationSec,
    sttLanguage: mapLanguageToStt(agent.language),
    infoToCollect: resolveInfoToCollect(agent),
  };
}

export type CallTurnStreamCallbacks = {
  onSentence: (sentence: string) => void | Promise<void>;
  onFirstToken?: () => void;
  signal?: AbortSignal;
};

/**
 * Runs one conversation turn with streaming tokens; emits sentence chunks for TTS.
 */
export async function runCallTurnStream(
  snapshot: CallAgentSnapshot,
  messages: CallChatMessage[],
  userText: string,
  callbacks: CallTurnStreamCallbacks,
  collectedInfo?: CollectedInfoMap,
  conversationState?: CallConversationState | null,
): Promise<{ fullReply: string; model: string }> {
  const env = getServerEnv();
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const trimmedUser = userText.trim();
  if (!trimmedUser) {
    throw new Error("Empty user transcript");
  }

  const screen = screenRuntimeUserMessage(trimmedUser);
  if (!screen.allowed && screen.safeReply) {
    await callbacks.onSentence(screen.safeReply);
    return { fullReply: screen.safeReply, model: "content-safety" };
  }

  const client = getOpenAIClient();
  const model = getVoiceOpenAiModel();
  const sentenceBuffer = new SentenceBuffer();
  const ttsMerger = new TtsSentenceMerger();
  let fullReply = "";

  const stream = await client.chat.completions.create({
    model,
    max_tokens: VOICE_MAX_TOKENS,
    temperature: VOICE_TEMPERATURE,
    stream: true,
    messages: buildOpenAiMessages(
      snapshot,
      messages,
      trimmedUser,
      collectedInfo,
      conversationState,
    ),
  });

  let firstToken = true;
  for await (const chunk of stream) {
    if (callbacks.signal?.aborted) {
      break;
    }
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (!delta) continue;

    if (firstToken) {
      firstToken = false;
      callbacks.onFirstToken?.();
    }

    fullReply += delta;
    for (const sentence of sentenceBuffer.push(delta)) {
      if (callbacks.signal?.aborted) break;
      for (const chunk of ttsMerger.push(sentence)) {
        await callbacks.onSentence(chunk);
      }
    }
  }

  if (!callbacks.signal?.aborted) {
    const tail = sentenceBuffer.flush();
    if (tail) {
      for (const chunk of ttsMerger.push(tail)) {
        await callbacks.onSentence(chunk);
      }
    }
    const mergedTail = ttsMerger.flush();
    if (mergedTail) {
      await callbacks.onSentence(mergedTail);
    }
  }

  fullReply = fullReply.trim();
  if (!fullReply && !callbacks.signal?.aborted) {
    throw new Error("OpenAI returned an empty reply");
  }

  return { fullReply, model };
}

/**
 * Runs one conversation turn using the frozen agent system prompt (non-streaming fallback).
 */
export async function runCallTurn(
  snapshot: CallAgentSnapshot,
  messages: CallChatMessage[],
  userText: string,
  signal?: AbortSignal,
): Promise<{ reply: string; model: string }> {
  let reply = "";
  const result = await runCallTurnStream(snapshot, messages, userText, {
    signal,
    onSentence: async (sentence) => {
      reply = reply ? `${reply} ${sentence}` : sentence;
    },
  });
  return { reply: result.fullReply || reply, model: result.model };
}

import { createServerSupabase } from "@/lib/db/supabase-server";
import { getOpenAIClient } from "@/lib/integrations/openai";
import { getServerEnv } from "@/lib/env/server";
import { resolveSystemPromptForAgent } from "@/lib/services/openai-agent";
import { resolveConvaiTtsVoiceId } from "@/lib/services/elevenlabs-voice-resolve";
import { getAgentForTenant } from "@/lib/services/agents";
import { PHONE_CONVERSATION_STYLE } from "@/lib/voice/phone-conversation-style";
import { SentenceBuffer } from "@/lib/voice/sentence-buffer";
import { getVoiceOpenAiModel } from "@/lib/voice/voice-tuning";

export type CallChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CallAgentSnapshot = {
  tenantId: string;
  agentId: string;
  systemPrompt: string;
  greeting: string | null;
  voiceId: string;
  language: string | null;
  maxDurationSec: number;
  sttLanguage: string;
};

const DEFAULT_MAX_DURATION_SEC = 600;
const VOICE_MAX_TOKENS = 120;
const VOICE_TEMPERATURE = 0.55;

function mapLanguageToStt(language: string | null): string {
  if (!language?.trim()) return "en-US";
  const l = language.trim();
  if (l.toLowerCase().startsWith("en")) return "en-US";
  return l;
}

function buildVoiceSystemPrompt(snapshot: CallAgentSnapshot): string {
  return `${snapshot.systemPrompt}\n\n${PHONE_CONVERSATION_STYLE}\n\n[tenant=${snapshot.tenantId}]`;
}

function buildOpenAiMessages(
  snapshot: CallAgentSnapshot,
  messages: CallChatMessage[],
  userText: string,
): { role: "system" | "user" | "assistant"; content: string }[] {
  const openAiMessages: {
    role: "system" | "user" | "assistant";
    content: string;
  }[] = [{ role: "system", content: buildVoiceSystemPrompt(snapshot) }];

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

  const supabase = createServerSupabase();
  const { data: settings } = await supabase
    .from("agent_advanced_settings")
    .select("max_duration")
    .eq("tenant_id", tenantId)
    .eq("agent_id", agentId)
    .is("deleted_at", null)
    .maybeSingle();

  let maxDurationSec = DEFAULT_MAX_DURATION_SEC;
  if (settings?.max_duration != null && typeof settings.max_duration === "number") {
    maxDurationSec = Math.max(60, Math.min(settings.max_duration, 3600));
  }

  return {
    tenantId,
    agentId,
    systemPrompt,
    greeting: agent.greeting?.trim() || null,
    voiceId: resolvedVoice.voiceId,
    language: agent.language,
    maxDurationSec,
    sttLanguage: mapLanguageToStt(agent.language),
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
): Promise<{ fullReply: string; model: string }> {
  const env = getServerEnv();
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const trimmedUser = userText.trim();
  if (!trimmedUser) {
    throw new Error("Empty user transcript");
  }

  const client = getOpenAIClient();
  const model = getVoiceOpenAiModel();
  const sentenceBuffer = new SentenceBuffer();
  let fullReply = "";

  const stream = await client.chat.completions.create({
    model,
    max_tokens: VOICE_MAX_TOKENS,
    temperature: VOICE_TEMPERATURE,
    stream: true,
    messages: buildOpenAiMessages(snapshot, messages, trimmedUser),
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
      await callbacks.onSentence(sentence);
    }
  }

  if (!callbacks.signal?.aborted) {
    const tail = sentenceBuffer.flush();
    if (tail) {
      await callbacks.onSentence(tail);
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

import { getOpenAIClient } from "@/lib/integrations/openai";
import { getServerEnv } from "@/lib/env/server";
import { getAgentForTenant } from "@/lib/services/agents";
import { screenRuntimeUserMessage } from "@/lib/prompt-content-safety-patterns";
import {
  buildVoiceSystemPrompt,
  loadTestAgentContext,
  VOICE_MAX_TOKENS,
  VOICE_TEMPERATURE,
} from "@/lib/services/twilio-call-agent";
import { getVoiceOpenAiModel } from "@/lib/voice/voice-tuning";
import type { AgentTestDraft } from "@/lib/validation/agent-test";

export type AgentTestChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RunAgentTestChatParams = {
  tenantId: string;
  agentId: string;
  messages: AgentTestChatMessage[];
  draft?: AgentTestDraft;
};

export type RunAgentTestChatResult = {
  reply: string;
  model: string;
  greetingUsed: string | null;
};

/**
 * Multi-turn text test chat using the same prompt and LLM settings as live calls.
 */
export async function runAgentTestChat(
  params: RunAgentTestChatParams,
): Promise<RunAgentTestChatResult> {
  const env = getServerEnv();
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const agent = await getAgentForTenant(params.tenantId, params.agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  const { snapshot } = await loadTestAgentContext(
    params.tenantId,
    params.agentId,
    params.draft,
  );

  const greeting = snapshot.greeting?.trim() || null;
  const systemPrompt = buildVoiceSystemPrompt(snapshot);
  const model = getVoiceOpenAiModel();

  if (params.messages.length === 0) {
    return {
      reply: greeting ?? "",
      model,
      greetingUsed: greeting,
    };
  }

  const openAiMessages: {
    role: "system" | "user" | "assistant";
    content: string;
  }[] = [{ role: "system", content: systemPrompt }];

  for (const m of params.messages) {
    openAiMessages.push({ role: m.role, content: m.content });
  }

  const lastUser = [...params.messages]
    .reverse()
    .find((m) => m.role === "user");
  if (lastUser) {
    const screen = screenRuntimeUserMessage(lastUser.content);
    if (!screen.allowed && screen.safeReply) {
      return {
        reply: screen.safeReply,
        model: "content-safety",
        greetingUsed: greeting,
      };
    }
  }

  const client = getOpenAIClient();

  const completion = await client.chat.completions.create({
    model,
    max_tokens: VOICE_MAX_TOKENS,
    temperature: VOICE_TEMPERATURE,
    messages: openAiMessages,
  });

  const reply = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!reply) {
    throw new Error("OpenAI returned an empty reply");
  }

  return { reply, model, greetingUsed: greeting };
}

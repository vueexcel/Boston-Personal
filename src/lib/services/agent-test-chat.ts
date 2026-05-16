import { getOpenAIClient } from "@/lib/integrations/openai";
import { getServerEnv } from "@/lib/env/server";
import { resolveSystemPromptForAgent } from "@/lib/services/openai-agent";
import { getAgentForTenant } from "@/lib/services/agents";
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
 * Multi-turn text test chat using the agent system prompt and OpenAI.
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

  const systemPrompt = await resolveSystemPromptForAgent(
    params.tenantId,
    params.agentId,
    { draft: params.draft, persist: false },
  );

  const greeting =
    params.draft?.greeting !== undefined
      ? params.draft.greeting?.trim() || null
      : agent.greeting?.trim() || null;

  const openAiMessages: {
    role: "system" | "user" | "assistant";
    content: string;
  }[] = [
    {
      role: "system",
      content: `${systemPrompt}\n\n[tenant=${params.tenantId}]`,
    },
  ];

  if (params.messages.length === 0 && greeting) {
    return { reply: greeting, model: env.OPENAI_MODEL?.trim() || "gpt-4o", greetingUsed: greeting };
  }

  for (const m of params.messages) {
    openAiMessages.push({ role: m.role, content: m.content });
  }

  const client = getOpenAIClient();
  const model = env.OPENAI_MODEL?.trim() || "gpt-4o";

  const completion = await client.chat.completions.create({
    model,
    max_tokens: 1024,
    temperature: 0.4,
    messages: openAiMessages,
  });

  const reply = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!reply) {
    throw new Error("OpenAI returned an empty reply");
  }

  return { reply, model, greetingUsed: greeting };
}

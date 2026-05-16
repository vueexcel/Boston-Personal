import { getOpenAIClient } from "@/lib/integrations/openai";
import { getServerEnv } from "@/lib/env/server";

/**
 * Executes a single-turn OpenAI completion for a tenant-scoped agent (API keys remain server-only).
 *
 * @param params - Tenant id for auditing, system prompt, and end-user content.
 */
export async function runConversationTurn(params: {
  tenantId: string;
  system: string;
  user: string;
}): Promise<{ text: string; model: string }> {
  const env = getServerEnv();
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const client = getOpenAIClient();
  const model = env.OPENAI_MODEL?.trim() || "gpt-4o";

  const completion = await client.chat.completions.create({
    model,
    max_tokens: 512,
    messages: [
      {
        role: "system",
        content: `${params.system}\n\n[tenant=${params.tenantId}]`,
      },
      { role: "user", content: params.user },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  return { text, model };
}

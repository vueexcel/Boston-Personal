import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { uuidSchema } from "@/lib/db/schema";
import {
  ensureConvaiAgentForBostelAgent,
} from "@/lib/services/elevenlabs-convai-agent";
import { syncAgentPromptToElevenLabs } from "@/lib/services/openai-agent";
import { agentTestSyncBodySchema } from "@/lib/validation/agent-test";
import { tenantIdSchema } from "@/lib/validation/tenant-id";

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
  agentId: uuidSchema,
});

export async function POST(
  request: Request,
  context: {
    params:
      | Promise<{ tenantId: string; agentId: string }>
      | { tenantId: string; agentId: string };
  },
): Promise<Response> {
  const paramsIn =
    "then" in context.params ? await context.params : context.params;
  const parsedParams = paramsSchema.safeParse(paramsIn);
  if (!parsedParams.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid tenant or agent id",
        details: parsedParams.error.flatten(),
      }),
      { status: 400 },
    );
  }

  const { tenantId, agentId } = parsedParams.data;
  const authz = await requireTenantApiAccess(tenantId);
  if (!authz.ok) return authz.response;

  let draft: z.infer<typeof agentTestSyncBodySchema>["draft"];
  const raw = await request.text();
  if (raw.trim()) {
    let json: unknown;
    try {
      json = JSON.parse(raw) as unknown;
    } catch {
      return jsonEnvelope(
        errEnvelope({ code: "INVALID_JSON", message: "Body must be JSON" }),
        { status: 400 },
      );
    }
    const parsed = agentTestSyncBodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonEnvelope(
        errEnvelope({
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parsed.error.flatten(),
        }),
        { status: 400 },
      );
    }
    draft = parsed.data.draft;
  }

  try {
    const elevenLabsAgentId = await ensureConvaiAgentForBostelAgent(
      tenantId,
      agentId,
      draft,
    );
    const synced = await syncAgentPromptToElevenLabs(agentId, {
      elevenLabsAgentId,
      regenerate: !draft,
      draft,
      persist: false,
    });
    return jsonEnvelope(
      okEnvelope({
        elevenLabsAgentId: synced.elevenLabsAgentId,
        synced: true,
        resolvedVoiceId: synced.resolvedVoiceId ?? null,
        voiceWarning: synced.voiceWarning ?? null,
      }),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    const code = message.includes("ELEVENLABS")
      ? "ELEVENLABS_NOT_CONFIGURED"
      : "AGENT_TEST_SYNC_ERROR";
    return jsonEnvelope(errEnvelope({ code, message }), {
      status: code === "ELEVENLABS_NOT_CONFIGURED" ? 503 : 500,
    });
  }
}

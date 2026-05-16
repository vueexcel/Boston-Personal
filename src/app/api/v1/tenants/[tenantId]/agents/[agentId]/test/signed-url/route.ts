import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { uuidSchema } from "@/lib/db/schema";
import { prepareAgentVoiceTest } from "@/lib/services/elevenlabs-convai-agent";
import { agentTestDraftSchema } from "@/lib/validation/agent-test";
import { tenantIdSchema } from "@/lib/validation/tenant-id";

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
  agentId: uuidSchema,
});

/**
 * GET optional `?draft=` base64url JSON for unsaved editor state.
 */
export async function GET(
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

  let draft: z.infer<typeof agentTestDraftSchema> | undefined;
  const draftParam = new URL(request.url).searchParams.get("draft");
  if (draftParam) {
    try {
      const json = JSON.parse(
        Buffer.from(draftParam, "base64url").toString("utf8"),
      ) as unknown;
      const parsed = agentTestDraftSchema.safeParse(json);
      if (!parsed.success) {
        return jsonEnvelope(
          errEnvelope({
            code: "VALIDATION_ERROR",
            message: "Invalid draft query parameter",
          }),
          { status: 400 },
        );
      }
      draft = parsed.data;
    } catch {
      return jsonEnvelope(
        errEnvelope({
          code: "VALIDATION_ERROR",
          message: "Invalid draft query parameter",
        }),
        { status: 400 },
      );
    }
  }

  try {
    const result = await prepareAgentVoiceTest(tenantId, agentId, draft);
    return jsonEnvelope(okEnvelope(result));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    const code = message.includes("ELEVENLABS")
      ? "ELEVENLABS_NOT_CONFIGURED"
      : "AGENT_TEST_VOICE_ERROR";
    return jsonEnvelope(errEnvelope({ code, message }), {
      status: code === "ELEVENLABS_NOT_CONFIGURED" ? 503 : 500,
    });
  }
}

import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { uuidSchema } from "@/lib/db/schema";
import { buildSystemPromptForDraft } from "@/lib/services/openai-agent";
import { scanAgentConfigContentSync } from "@/lib/services/prompt-content-safety";
import { agentTestDraftSchema } from "@/lib/validation/agent-test";
import { tenantIdSchema } from "@/lib/validation/tenant-id";
import { serializeAgentPortalConfig } from "@/lib/tenant-portal/agent-config-v1";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonEnvelope(
      errEnvelope({ code: "INVALID_JSON", message: "Body must be JSON" }),
      { status: 400 },
    );
  }

  const parsed = agentTestDraftSchema.safeParse(body);
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

  try {
    const prompt = await buildSystemPromptForDraft(
      tenantId,
      agentId,
      parsed.data,
    );
    const safety = scanAgentConfigContentSync({
      greeting: parsed.data.greeting,
      roleDescription: serializeAgentPortalConfig(parsed.data.portalConfig),
    });
    return jsonEnvelope(
      okEnvelope({
        prompt,
        warnings:
          safety.issues.length > 0 ? safety.issues : undefined,
      }),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return jsonEnvelope(
      errEnvelope({ code: "PROMPT_PREVIEW_ERROR", message }),
      { status: 500 },
    );
  }
}

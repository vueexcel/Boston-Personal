import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { uuidSchema } from "@/lib/db/schema";
import { runAgentTestChat } from "@/lib/services/agent-test-chat";
import { agentTestChatBodySchema } from "@/lib/validation/agent-test";
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonEnvelope(
      errEnvelope({ code: "INVALID_JSON", message: "Body must be JSON" }),
      { status: 400 },
    );
  }

  const parsedBody = agentTestChatBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid request body",
        details: parsedBody.error.flatten(),
      }),
      { status: 400 },
    );
  }

  try {
    const result = await runAgentTestChat({
      tenantId,
      agentId,
      messages: parsedBody.data.messages,
      draft: parsedBody.data.draft,
    });
    return jsonEnvelope(okEnvelope(result));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    const code =
      message.includes("not configured") || message.includes("OPENAI")
        ? "OPENAI_NOT_CONFIGURED"
        : message.includes("not found")
          ? "NOT_FOUND"
          : "AGENT_TEST_ERROR";
    const status =
      code === "NOT_FOUND" ? 404 : code === "OPENAI_NOT_CONFIGURED" ? 503 : 500;
    return jsonEnvelope(errEnvelope({ code, message }), { status });
  }
}

import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { uuidSchema } from "@/lib/db/schema";
import { createScribeSingleUseToken } from "@/lib/services/elevenlabs-scribe-token";
import { validateTestCallSessionToken } from "@/lib/voice/test-call-session";
import { tenantIdSchema } from "@/lib/validation/tenant-id";

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
  agentId: uuidSchema,
});

const bodySchema = z.object({
  sessionId: z.string().min(1),
  sessionToken: z.string().min(1),
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

  let json: unknown;
  try {
    json = (await request.json()) as unknown;
  } catch {
    return jsonEnvelope(
      errEnvelope({ code: "INVALID_JSON", message: "Body must be JSON" }),
      { status: 400 },
    );
  }

  const parsedBody = bodySchema.safeParse(json);
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

  const { sessionId, sessionToken } = parsedBody.data;
  const session = await validateTestCallSessionToken(sessionId, sessionToken);
  if (!session) {
    return jsonEnvelope(
      errEnvelope({
        code: "INVALID_SESSION",
        message: "Voice test session is invalid or expired",
      }),
      { status: 401 },
    );
  }

  if (session.tenantId !== tenantId || session.agentId !== agentId) {
    return jsonEnvelope(
      errEnvelope({
        code: "INVALID_SESSION",
        message: "Voice test session does not match this agent",
      }),
      { status: 403 },
    );
  }

  try {
    const { token } = await createScribeSingleUseToken();
    return jsonEnvelope(okEnvelope({ token }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    const code = message.includes("not configured")
      ? "VOICE_NOT_CONFIGURED"
      : "SCRIBE_TOKEN_ERROR";
    const status = code === "VOICE_NOT_CONFIGURED" ? 503 : 500;
    return jsonEnvelope(errEnvelope({ code, message }), { status });
  }
}

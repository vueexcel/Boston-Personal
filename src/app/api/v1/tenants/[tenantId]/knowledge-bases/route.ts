import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import {
  createKnowledgeBase,
  listKnowledgeBases,
} from "@/lib/services/knowledge-bases";
import { ContentSafetyViolationError } from "@/lib/services/prompt-content-safety";
import { createKnowledgeBaseBodySchema } from "@/lib/validation/knowledge-bases";
import { tenantIdSchema } from "@/lib/validation/tenant-id";

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
});

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ tenantId: string }> | { tenantId: string };
  },
): Promise<Response> {
  const paramsIn =
    "then" in context.params ? await context.params : context.params;
  const parsedParams = paramsSchema.safeParse(paramsIn);
  if (!parsedParams.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid tenant id",
        details: parsedParams.error.flatten(),
      }),
      { status: 400 },
    );
  }

  const { tenantId } = parsedParams.data;
  const authz = await requireTenantApiAccess(tenantId);
  if (!authz.ok) return authz.response;

  try {
    const knowledgeBases = await listKnowledgeBases(tenantId);
    return jsonEnvelope(okEnvelope({ knowledgeBases }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return jsonEnvelope(
      errEnvelope({ code: "DATASTORE_ERROR", message }),
      { status: 503 },
    );
  }
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{ tenantId: string }> | { tenantId: string };
  },
): Promise<Response> {
  const paramsIn =
    "then" in context.params ? await context.params : context.params;
  const parsedParams = paramsSchema.safeParse(paramsIn);
  if (!parsedParams.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid tenant id",
        details: parsedParams.error.flatten(),
      }),
      { status: 400 },
    );
  }

  const { tenantId } = parsedParams.data;
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

  const parsed = createKnowledgeBaseBodySchema.safeParse(body);
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
    const knowledgeBase = await createKnowledgeBase(tenantId, parsed.data);
    return jsonEnvelope(okEnvelope({ knowledgeBase }), { status: 201 });
  } catch (e) {
    if (e instanceof ContentSafetyViolationError) {
      return jsonEnvelope(
        errEnvelope({
          code: e.code,
          message: e.message,
          details: { issues: e.issues },
        }),
        { status: 400 },
      );
    }
    const message = e instanceof Error ? e.message : "Unexpected error";
    return jsonEnvelope(
      errEnvelope({ code: "DATASTORE_ERROR", message }),
      { status: 503 },
    );
  }
}

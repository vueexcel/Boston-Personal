import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { uuidSchema } from "@/lib/db/schema";
import {
  createKnowledgeDocumentForBase,
  listKnowledgeDocuments,
} from "@/lib/services/knowledge-documents";
import { ContentSafetyViolationError } from "@/lib/services/prompt-content-safety";
import { createKnowledgeDocumentBodySchema } from "@/lib/validation/knowledge-bases";
import { tenantIdSchema } from "@/lib/validation/tenant-id";

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
  kbId: uuidSchema,
});

export async function GET(
  _request: Request,
  context: {
    params:
      | Promise<{ tenantId: string; kbId: string }>
      | { tenantId: string; kbId: string };
  },
): Promise<Response> {
  const paramsIn =
    "then" in context.params ? await context.params : context.params;
  const parsedParams = paramsSchema.safeParse(paramsIn);
  if (!parsedParams.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid tenant or knowledge base id",
        details: parsedParams.error.flatten(),
      }),
      { status: 400 },
    );
  }

  const { tenantId, kbId } = parsedParams.data;
  const authz = await requireTenantApiAccess(tenantId);
  if (!authz.ok) return authz.response;

  try {
    const documents = await listKnowledgeDocuments(tenantId, kbId);
    return jsonEnvelope(okEnvelope({ documents }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    const status = message.includes("not found") ? 404 : 503;
    return jsonEnvelope(
      errEnvelope({
        code: status === 404 ? "NOT_FOUND" : "DATASTORE_ERROR",
        message,
      }),
      { status },
    );
  }
}

export async function POST(
  request: Request,
  context: {
    params:
      | Promise<{ tenantId: string; kbId: string }>
      | { tenantId: string; kbId: string };
  },
): Promise<Response> {
  const paramsIn =
    "then" in context.params ? await context.params : context.params;
  const parsedParams = paramsSchema.safeParse(paramsIn);
  if (!parsedParams.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid tenant or knowledge base id",
        details: parsedParams.error.flatten(),
      }),
      { status: 400 },
    );
  }

  const { tenantId, kbId } = parsedParams.data;
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

  const parsed = createKnowledgeDocumentBodySchema.safeParse(body);
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
    const { document, warnings } = await createKnowledgeDocumentForBase(
      tenantId,
      kbId,
      parsed.data,
    );
    return jsonEnvelope(
      okEnvelope({
        document,
        warnings: warnings.length > 0 ? warnings : undefined,
      }),
      { status: 201 },
    );
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
    const status = message.includes("not found") ? 404 : 503;
    return jsonEnvelope(
      errEnvelope({
        code: status === 404 ? "NOT_FOUND" : "DATASTORE_ERROR",
        message,
      }),
      { status },
    );
  }
}

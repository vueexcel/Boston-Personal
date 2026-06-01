import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { uuidSchema } from "@/lib/db/schema";
import {
  getKnowledgeDocument,
  softDeleteKnowledgeDocument,
  updateKnowledgeDocument,
} from "@/lib/services/knowledge-documents";
import { updateKnowledgeDocumentBodySchema } from "@/lib/validation/knowledge-bases";
import { tenantIdSchema } from "@/lib/validation/tenant-id";

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
  kbId: uuidSchema,
  docId: uuidSchema,
});

export async function GET(
  _request: Request,
  context: {
    params:
      | Promise<{ tenantId: string; kbId: string; docId: string }>
      | { tenantId: string; kbId: string; docId: string };
  },
): Promise<Response> {
  const paramsIn =
    "then" in context.params ? await context.params : context.params;
  const parsedParams = paramsSchema.safeParse(paramsIn);
  if (!parsedParams.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid id",
        details: parsedParams.error.flatten(),
      }),
      { status: 400 },
    );
  }

  const { tenantId, kbId, docId } = parsedParams.data;
  const authz = await requireTenantApiAccess(tenantId);
  if (!authz.ok) return authz.response;

  try {
    const document = await getKnowledgeDocument(tenantId, kbId, docId);
    if (!document) {
      return jsonEnvelope(
        errEnvelope({ code: "NOT_FOUND", message: "Document not found" }),
        { status: 404 },
      );
    }
    return jsonEnvelope(okEnvelope({ document }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return jsonEnvelope(
      errEnvelope({ code: "DATASTORE_ERROR", message }),
      { status: 503 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: {
    params:
      | Promise<{ tenantId: string; kbId: string; docId: string }>
      | { tenantId: string; kbId: string; docId: string };
  },
): Promise<Response> {
  const paramsIn =
    "then" in context.params ? await context.params : context.params;
  const parsedParams = paramsSchema.safeParse(paramsIn);
  if (!parsedParams.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid id",
        details: parsedParams.error.flatten(),
      }),
      { status: 400 },
    );
  }

  const { tenantId, kbId, docId } = parsedParams.data;
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

  const parsed = updateKnowledgeDocumentBodySchema.safeParse(body);
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
    const document = await updateKnowledgeDocument(
      tenantId,
      kbId,
      docId,
      parsed.data,
    );
    return jsonEnvelope(okEnvelope({ document }));
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

export async function DELETE(
  _request: Request,
  context: {
    params:
      | Promise<{ tenantId: string; kbId: string; docId: string }>
      | { tenantId: string; kbId: string; docId: string };
  },
): Promise<Response> {
  const paramsIn =
    "then" in context.params ? await context.params : context.params;
  const parsedParams = paramsSchema.safeParse(paramsIn);
  if (!parsedParams.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid id",
        details: parsedParams.error.flatten(),
      }),
      { status: 400 },
    );
  }

  const { tenantId, kbId, docId } = parsedParams.data;
  const authz = await requireTenantApiAccess(tenantId);
  if (!authz.ok) return authz.response;

  try {
    await softDeleteKnowledgeDocument(tenantId, kbId, docId);
    return jsonEnvelope(okEnvelope({ deleted: true }));
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

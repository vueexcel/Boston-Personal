import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { uuidSchema } from "@/lib/db/schema";
import {
  getKnowledgeBase,
  softDeleteKnowledgeBase,
  updateKnowledgeBase,
} from "@/lib/services/knowledge-bases";
import { updateKnowledgeBaseBodySchema } from "@/lib/validation/knowledge-bases";
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
    const knowledgeBase = await getKnowledgeBase(tenantId, kbId);
    if (!knowledgeBase) {
      return jsonEnvelope(
        errEnvelope({ code: "NOT_FOUND", message: "Knowledge base not found" }),
        { status: 404 },
      );
    }
    return jsonEnvelope(okEnvelope({ knowledgeBase }));
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

  const parsed = updateKnowledgeBaseBodySchema.safeParse(body);
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
    const knowledgeBase = await updateKnowledgeBase(
      tenantId,
      kbId,
      parsed.data,
    );
    return jsonEnvelope(okEnvelope({ knowledgeBase }));
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
    await softDeleteKnowledgeBase(tenantId, kbId);
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

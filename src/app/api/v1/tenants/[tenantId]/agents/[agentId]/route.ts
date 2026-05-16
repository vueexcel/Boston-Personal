import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import {
  getAgentForTenant,
  softDeleteAgentForTenant,
  updateAgentForTenant,
} from "@/lib/services/agents";
import { updateAgentBodySchema } from "@/lib/validation/agents-update";
import { tenantIdSchema } from "@/lib/validation/tenant-id";
import { uuidSchema } from "@/lib/db/schema";

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
  agentId: uuidSchema,
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ tenantId: string; agentId: string }> | { tenantId: string; agentId: string } },
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

  try {
    const agent = await getAgentForTenant(tenantId, agentId);
    if (!agent) {
      return jsonEnvelope(
        errEnvelope({ code: "NOT_FOUND", message: "Agent not found" }),
        { status: 404 },
      );
    }
    return jsonEnvelope(okEnvelope({ agent }));
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
  context: { params: Promise<{ tenantId: string; agentId: string }> | { tenantId: string; agentId: string } },
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
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Expected JSON body",
      }),
      { status: 400 },
    );
  }

  const parsedBody = updateAgentBodySchema.safeParse(body);
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
    await updateAgentForTenant(tenantId, agentId, parsedBody.data);
    const agent = await getAgentForTenant(tenantId, agentId);
    if (!agent) {
      return jsonEnvelope(
        errEnvelope({
          code: "DATASTORE_ERROR",
          message: "Update succeeded but could not reload agent",
        }),
        { status: 503 },
      );
    }
    return jsonEnvelope(okEnvelope({ agent }));
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === "AGENT_NOT_FOUND" || err.message === "AGENT_NOT_FOUND") {
      return jsonEnvelope(
        errEnvelope({ code: "NOT_FOUND", message: "Agent not found" }),
        { status: 404 },
      );
    }
    if (
      err.code === "AGENT_UPDATE_NO_ROWS" ||
      err.message.startsWith("AGENT_UPDATE_NO_ROWS")
    ) {
      return jsonEnvelope(
        errEnvelope({
          code: "CONFLICT",
          message:
            "No database row was updated. The agent id may not belong to this tenant, or the row was deleted.",
        }),
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return jsonEnvelope(
      errEnvelope({ code: "DATASTORE_ERROR", message }),
      { status: 503 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ tenantId: string; agentId: string }> | { tenantId: string; agentId: string } },
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

  try {
    const deleted = await softDeleteAgentForTenant(tenantId, agentId);
    if (!deleted) {
      return jsonEnvelope(
        errEnvelope({ code: "NOT_FOUND", message: "Agent not found" }),
        { status: 404 },
      );
    }
    return jsonEnvelope(okEnvelope({ ok: true }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return jsonEnvelope(
      errEnvelope({ code: "DATASTORE_ERROR", message }),
      { status: 503 },
    );
  }
}

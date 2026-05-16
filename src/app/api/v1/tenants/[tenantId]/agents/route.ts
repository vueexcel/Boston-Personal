import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { createAgentForTenant, listAgentsForTenant } from "@/lib/services/agents";
import { createAgentBodySchema } from "@/lib/validation/agents-create";
import { tenantIdSchema } from "@/lib/validation/tenant-id";

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
});

/**
 * Lists draft/active agents for a tenant.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ tenantId: string }> | { tenantId: string } },
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
    const agents = await listAgentsForTenant(tenantId);
    return jsonEnvelope(okEnvelope({ agents }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return jsonEnvelope(
      errEnvelope({
        code: "DATASTORE_ERROR",
        message,
      }),
      { status: 503 },
    );
  }
}

/**
 * Creates a new draft agent (wizard or blank).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ tenantId: string }> | { tenantId: string } },
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
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Expected JSON body",
      }),
      { status: 400 },
    );
  }

  const parsedBody = createAgentBodySchema.safeParse(body);
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
    const agent = await createAgentForTenant(tenantId, parsedBody.data);
    return jsonEnvelope(
      okEnvelope({
        agent: {
          id: agent.id,
          name: agent.name,
          status: agent.status,
        },
      }),
      { status: 201 },
    );
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === "TENANT_NOT_FOUND" || err.message === "TENANT_NOT_FOUND") {
      return jsonEnvelope(
        errEnvelope({
          code: "NOT_FOUND",
          message: "Tenant not found",
        }),
        { status: 404 },
      );
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return jsonEnvelope(
      errEnvelope({
        code: "DATASTORE_ERROR",
        message,
      }),
      { status: 503 },
    );
  }
}

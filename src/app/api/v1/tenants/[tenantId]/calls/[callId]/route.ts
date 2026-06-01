import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { getCallDetailForTenant } from "@/lib/services/calls";
import { tenantIdSchema } from "@/lib/validation/tenant-id";

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
  callId: tenantIdSchema,
});

/**
 * Returns a single call log with transcript turns, summary, and metadata.
 */
export async function GET(
  _request: Request,
  context: {
    params:
      | Promise<{ tenantId: string; callId: string }>
      | { tenantId: string; callId: string };
  },
): Promise<Response> {
  const paramsIn =
    "then" in context.params ? await context.params : context.params;
  const parsed = paramsSchema.safeParse(paramsIn);
  if (!parsed.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid parameters",
        details: parsed.error.flatten(),
      }),
      { status: 400 },
    );
  }

  const authz = await requireTenantApiAccess(parsed.data.tenantId);
  if (!authz.ok) return authz.response;

  try {
    const call = await getCallDetailForTenant(
      parsed.data.tenantId,
      parsed.data.callId,
    );
    if (!call) {
      return jsonEnvelope(
        errEnvelope({ code: "NOT_FOUND", message: "Call not found" }),
        { status: 404 },
      );
    }
    return jsonEnvelope(okEnvelope({ call }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return jsonEnvelope(
      errEnvelope({ code: "DATASTORE_ERROR", message }),
      { status: 503 },
    );
  }
}

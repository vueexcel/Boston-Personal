import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import {
  getTenantRoutingSettings,
  updateTenantRoutingSettings,
} from "@/lib/services/tenant-routing";
import { updateRoutingSettingsRequestSchema } from "@/lib/validation/routing-settings";
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
    const payload = await getTenantRoutingSettings(tenantId);
    if (!payload) {
      return jsonEnvelope(
        errEnvelope({ code: "NOT_FOUND", message: "Tenant not found" }),
        { status: 404 },
      );
    }
    return jsonEnvelope(okEnvelope(payload));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return jsonEnvelope(
      errEnvelope({ code: "DATASTORE_ERROR", message }),
      { status: 503 },
    );
  }
}

export async function PUT(
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

  const parsed = updateRoutingSettingsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid routing settings",
        details: parsed.error.flatten(),
      }),
      { status: 400 },
    );
  }

  try {
    const payload = await updateTenantRoutingSettings(tenantId, parsed.data);
    return jsonEnvelope(okEnvelope(payload));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    const status = message.includes("not found") ? 404 : 503;
    return jsonEnvelope(
      errEnvelope({ code: "DATASTORE_ERROR", message }),
      { status },
    );
  }
}

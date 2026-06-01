import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { uuidSchema } from "@/lib/db/schema";
import {
  releasePhoneNumberForTenant,
  updatePhoneNumberAssignment,
} from "@/lib/services/phone-numbers";
import { updatePhoneNumberBodySchema } from "@/lib/validation/phone-numbers";
import { tenantIdSchema } from "@/lib/validation/tenant-id";

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
  phoneId: uuidSchema,
});

export async function PATCH(
  request: Request,
  context: {
    params:
      | Promise<{ tenantId: string; phoneId: string }>
      | { tenantId: string; phoneId: string };
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

  const { tenantId, phoneId } = parsedParams.data;
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

  const parsed = updatePhoneNumberBodySchema.safeParse(body);
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
    const phoneNumber = await updatePhoneNumberAssignment(
      tenantId,
      phoneId,
      parsed.data.assignedAgentId,
    );
    return jsonEnvelope(okEnvelope({ phoneNumber }));
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
      | Promise<{ tenantId: string; phoneId: string }>
      | { tenantId: string; phoneId: string };
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

  const { tenantId, phoneId } = parsedParams.data;
  const authz = await requireTenantApiAccess(tenantId);
  if (!authz.ok) return authz.response;

  try {
    await releasePhoneNumberForTenant(tenantId, phoneId);
    return jsonEnvelope(okEnvelope({ released: true }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    const status = message.includes("not found") ? 404 : 503;
    return jsonEnvelope(
      errEnvelope({
        code: status === 404 ? "NOT_FOUND" : "RELEASE_ERROR",
        message,
      }),
      { status },
    );
  }
}

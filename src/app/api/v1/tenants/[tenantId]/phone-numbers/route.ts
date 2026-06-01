import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import {
  listPhoneNumbersForTenant,
  provisionPhoneNumberForTenant,
} from "@/lib/services/phone-numbers";
import { provisionPhoneNumberBodySchema } from "@/lib/validation/phone-numbers";
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
      }),
      { status: 400 },
    );
  }

  const { tenantId } = parsedParams.data;
  const authz = await requireTenantApiAccess(tenantId);
  if (!authz.ok) return authz.response;

  try {
    const phoneNumbers = await listPhoneNumbersForTenant(tenantId);
    return jsonEnvelope(okEnvelope({ phoneNumbers }));
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
      errEnvelope({ code: "VALIDATION_ERROR", message: "Invalid tenant id" }),
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

  const parsed = provisionPhoneNumberBodySchema.safeParse(body);
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
    const phoneNumber = await provisionPhoneNumberForTenant(
      tenantId,
      parsed.data.phoneNumber,
      parsed.data.assignedAgentId ?? null,
    );
    return jsonEnvelope(okEnvelope({ phoneNumber }), { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    const status = message.includes("already registered") ? 409 : 503;
    return jsonEnvelope(
      errEnvelope({
        code: status === 409 ? "CONFLICT" : "PROVISION_ERROR",
        message,
      }),
      { status },
    );
  }
}

import { z } from "zod";
import { okEnvelope, errEnvelope, jsonEnvelope } from "@/lib/api/response";
import { requirePlatformAdminApi } from "@/lib/auth/platform-access";
import { tenantStatusSchema } from "@/lib/db/enums";
import { tenantProfileSettingsSchema } from "@/lib/db/tenant-settings";
import {
  normalizeTenantPlanCode,
  TENANT_PLAN_CODES,
} from "@/lib/db/tenant-plans";
import { writeAuditLog } from "@/lib/services/audit-log";
import {
  getPlatformTenantDetail,
  softDeletePlatformTenant,
  updatePlatformTenant,
} from "@/lib/services/platform-tenants";

const patchSchema = z.object({
  accountName: z.string().min(1).max(200).optional(),
  planCode: z
    .string()
    .min(1)
    .max(64)
    .transform(normalizeTenantPlanCode)
    .refine(
      (code) => (TENANT_PLAN_CODES as readonly string[]).includes(code),
      "Invalid plan code",
    )
    .optional(),
  status: tenantStatusSchema.optional(),
  settings: tenantProfileSettingsSchema.partial().optional(),
  maxAgents: z.number().int().min(0).optional(),
  maxPhoneNumbers: z.number().int().min(0).optional(),
});

type RouteContext = { params: { tenantId: string } };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const auth = await requirePlatformAdminApi();
  if (!auth.ok) return auth.response;

  const tenant = await getPlatformTenantDetail(context.params.tenantId);
  if (!tenant) {
    return jsonEnvelope(
      errEnvelope({ code: "NOT_FOUND", message: "Tenant not found" }),
      { status: 404 },
    );
  }
  return jsonEnvelope(okEnvelope(tenant));
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const auth = await requirePlatformAdminApi();
  if (!auth.ok) return auth.response;

  const before = await getPlatformTenantDetail(context.params.tenantId);
  if (!before) {
    return jsonEnvelope(
      errEnvelope({ code: "NOT_FOUND", message: "Tenant not found" }),
      { status: 404 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonEnvelope(
      errEnvelope({ code: "BAD_REQUEST", message: "Invalid JSON" }),
      { status: 400 },
    );
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return jsonEnvelope(
      errEnvelope({ code: "BAD_REQUEST", message: "Invalid input" }),
      { status: 400 },
    );
  }

  const updated = await updatePlatformTenant(context.params.tenantId, {
    accountName: parsed.data.accountName,
    planCode: parsed.data.planCode,
    status: parsed.data.status,
    settings: parsed.data.settings,
    maxAgents: parsed.data.maxAgents,
    maxPhoneNumbers: parsed.data.maxPhoneNumbers,
  });

  if (!updated) {
    return jsonEnvelope(
      errEnvelope({ code: "NOT_FOUND", message: "Tenant not found" }),
      { status: 404 },
    );
  }

  await writeAuditLog({
    tenantId: context.params.tenantId,
    userId: auth.user.id,
    entityType: "tenant",
    entityId: context.params.tenantId,
    action: "UPDATE",
    oldValue: before,
    newValue: updated,
  });

  return jsonEnvelope(okEnvelope(updated));
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const auth = await requirePlatformAdminApi();
  if (!auth.ok) return auth.response;

  const before = await getPlatformTenantDetail(context.params.tenantId);
  if (!before) {
    return jsonEnvelope(
      errEnvelope({ code: "NOT_FOUND", message: "Tenant not found" }),
      { status: 404 },
    );
  }

  const deleted = await softDeletePlatformTenant(context.params.tenantId);
  if (!deleted) {
    return jsonEnvelope(
      errEnvelope({ code: "NOT_FOUND", message: "Tenant not found" }),
      { status: 404 },
    );
  }

  await writeAuditLog({
    tenantId: context.params.tenantId,
    userId: auth.user.id,
    entityType: "tenant",
    entityId: context.params.tenantId,
    action: "DELETE",
    oldValue: before,
    newValue: { deleted: true },
  });

  return jsonEnvelope(okEnvelope({ deleted: true }));
}

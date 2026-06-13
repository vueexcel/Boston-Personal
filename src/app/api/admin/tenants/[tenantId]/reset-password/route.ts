import { z } from "zod";
import { okEnvelope, errEnvelope, jsonEnvelope } from "@/lib/api/response";
import { requirePlatformAdminApi } from "@/lib/auth/platform-access";
import { writeAuditLog } from "@/lib/services/audit-log";
import {
  getPlatformTenantDetail,
  resetTenantAdminPassword,
} from "@/lib/services/platform-tenants";

const bodySchema = z.object({
  password: z.string().min(8).max(128).optional(),
});

type RouteContext = { params: { tenantId: string } };

export async function POST(
  request: Request,
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

  let json: unknown = {};
  try {
    const text = await request.text();
    if (text) json = JSON.parse(text);
  } catch {
    return jsonEnvelope(
      errEnvelope({ code: "BAD_REQUEST", message: "Invalid JSON" }),
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonEnvelope(
      errEnvelope({ code: "BAD_REQUEST", message: "Invalid input" }),
      { status: 400 },
    );
  }

  const result = await resetTenantAdminPassword(
    context.params.tenantId,
    parsed.data.password,
  );
  if (!result) {
    return jsonEnvelope(
      errEnvelope({
        code: "NOT_FOUND",
        message: "No tenant admin user found",
      }),
      { status: 404 },
    );
  }

  await writeAuditLog({
    tenantId: context.params.tenantId,
    userId: auth.user.id,
    entityType: "user",
    entityId: result.userId,
    action: "RESET_PASSWORD",
    newValue: { email: result.email },
  });

  return jsonEnvelope(
    okEnvelope({
      email: result.email,
      temporaryPassword: result.temporaryPassword,
    }),
  );
}

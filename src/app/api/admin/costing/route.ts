import { okEnvelope, errEnvelope, jsonEnvelope } from "@/lib/api/response";
import { requirePlatformAdminApi } from "@/lib/auth/platform-access";
import { costingSettingsSchema } from "@/lib/db/costing-settings";
import { writeAuditLog } from "@/lib/services/audit-log";
import {
  getCostingSettings,
  updateCostingSettings,
} from "@/lib/services/costing-settings";

export async function GET(): Promise<Response> {
  const auth = await requirePlatformAdminApi();
  if (!auth.ok) return auth.response;

  const settings = await getCostingSettings();
  return jsonEnvelope(okEnvelope(settings));
}

export async function PATCH(request: Request): Promise<Response> {
  const auth = await requirePlatformAdminApi();
  if (!auth.ok) return auth.response;

  const before = await getCostingSettings();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonEnvelope(
      errEnvelope({ code: "BAD_REQUEST", message: "Invalid JSON" }),
      { status: 400 },
    );
  }

  const parsed = costingSettingsSchema.safeParse(json);
  if (!parsed.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "BAD_REQUEST",
        message: "Invalid pricing configuration",
        details: parsed.error.flatten(),
      }),
      { status: 400 },
    );
  }

  const updated = await updateCostingSettings(parsed.data);

  await writeAuditLog({
    userId: auth.user.id,
    entityType: "costing_settings",
    entityId: "1",
    action: "UPDATE",
    oldValue: before,
    newValue: updated,
  });

  return jsonEnvelope(okEnvelope(updated));
}

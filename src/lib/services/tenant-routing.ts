import { query, queryOne } from "@/lib/db/postgres";
import { parseTenantProfileSettings } from "@/lib/db/tenant-settings";
import {
  normalizeTimezone,
  parseTenantRoutingSettings,
} from "@/lib/services/routing-schedule";
import { refreshTenantMetaCacheAfterWrite } from "@/lib/services/tenant";
import {
  defaultTenantRoutingSettings,
  type TenantRoutingSettingsV1,
} from "@/lib/tenant-portal/routing-settings-v1";
import type { UpdateRoutingSettingsRequest } from "@/lib/validation/routing-settings";
import { toTenantRoutingSettingsV1 } from "@/lib/validation/routing-settings";

export type TenantRoutingPayload = {
  routing: TenantRoutingSettingsV1;
  timezone: string;
};

async function loadSettingsJson(
  tenantId: string,
): Promise<Record<string, unknown> | null> {
  const row = await queryOne<{ settings: unknown }>(
    `SELECT settings FROM public.tenants WHERE id = $1 AND deleted_at IS NULL`,
    [tenantId],
  );
  if (!row?.settings || typeof row.settings !== "object" || Array.isArray(row.settings)) {
    return null;
  }
  return row.settings as Record<string, unknown>;
}

export async function getTenantRoutingSettings(
  tenantId: string,
): Promise<TenantRoutingPayload | null> {
  const settings = await loadSettingsJson(tenantId);
  if (!settings) return null;

  const profile = parseTenantProfileSettings(settings);
  const timezone = normalizeTimezone(profile.timezone);
  const routing = parseTenantRoutingSettings(settings.routing);

  return { routing, timezone };
}

export async function updateTenantRoutingSettings(
  tenantId: string,
  body: UpdateRoutingSettingsRequest,
): Promise<TenantRoutingPayload> {
  const existing = await loadSettingsJson(tenantId);
  if (!existing) {
    throw new Error("Tenant not found");
  }

  const profile = parseTenantProfileSettings(existing);
  const routing = toTenantRoutingSettingsV1(body.routing);
  const timezone = body.timezone
    ? normalizeTimezone(body.timezone)
    : normalizeTimezone(profile.timezone);

  const merged: Record<string, unknown> = {
    ...existing,
    ...profile,
    timezone,
    routing,
  };

  await query(
    `UPDATE public.tenants SET settings = $2::jsonb WHERE id = $1 AND deleted_at IS NULL`,
    [tenantId, JSON.stringify(merged)],
  );

  await refreshTenantMetaCacheAfterWrite(tenantId);

  return { routing, timezone };
}

export function defaultRoutingPayload(): TenantRoutingPayload {
  return {
    routing: defaultTenantRoutingSettings(),
    timezone: "America/New_York",
  };
}

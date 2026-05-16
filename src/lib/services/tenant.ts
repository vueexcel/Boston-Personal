import {
  getCachedTenantMeta,
  invalidateTenantMetaCache,
  setCachedTenantMeta,
} from "@/lib/cache/tenant-meta-cache";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { tenantProfileSchema, type TenantProfile } from "@/lib/db/schema";

function toIsoUtc(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function mapTenantRow(row: Record<string, unknown>): TenantProfile | null {
  const settingsRaw = row.settings;
  const settings =
    settingsRaw && typeof settingsRaw === "object" && !Array.isArray(settingsRaw)
      ? (settingsRaw as Record<string, unknown>)
      : {};
  const timezone =
    typeof settings.timezone === "string" && settings.timezone.length > 0
      ? settings.timezone
      : "America/New_York";

  const parsed = tenantProfileSchema.safeParse({
    tenantId: row.id,
    accountName:
      typeof row.account_name === "string" ? row.account_name : "",
    status: row.status,
    planCode: typeof row.plan_code === "string" ? row.plan_code : "",
    timezone,
    externalId: typeof row.external_id === "string" ? row.external_id : "",
    createdAt: toIsoUtc(row.created_at as string) ?? new Date().toISOString(),
    updatedAt: toIsoUtc(row.updated_at as string) ?? new Date().toISOString(),
  });
  if (!parsed.success) return null;
  if (String(parsed.data.tenantId) !== String(row.id)) return null;
  return parsed.data;
}

/**
 * Loads tenant profile from Postgres (authoritative).
 *
 * @param tenantId - Tenant UUID; must equal the authenticated tenant context.
 * @returns Parsed tenant profile or null when not found.
 */
export async function getTenantProfileFromDb(
  tenantId: string,
): Promise<TenantProfile | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("tenants")
    .select(
      "id, external_id, account_name, status, plan_code, settings, created_at, updated_at",
    )
    .eq("id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;
  return mapTenantRow(data as unknown as Record<string, unknown>);
}

/**
 * @deprecated Use {@link getTenantProfileFromDb}.
 */
export const getTenantMetaFromDynamo = getTenantProfileFromDb;

/**
 * Returns tenant profile using Redis as a read-through cache with short TTL.
 *
 * @param tenantId - Tenant id for tenant-scoped reads.
 */
export async function getTenantMetaCached(
  tenantId: string,
): Promise<TenantProfile | null> {
  const hit = await getCachedTenantMeta(tenantId);
  if (hit && hit.tenantId === tenantId) return hit;
  const fresh = await getTenantProfileFromDb(tenantId);
  if (fresh) {
    await setCachedTenantMeta(tenantId, fresh);
  }
  return fresh;
}

/**
 * Returns true when the tenant exists and is **ACTIVE** (eligible for live voice agents).
 *
 * @param tenantId - Tenant identifier.
 */
export async function isTenantActive(tenantId: string): Promise<boolean> {
  const meta = await getTenantMetaCached(tenantId);
  return meta?.status === "ACTIVE";
}

/**
 * Clears cached tenant profile after a mutating write to tenant state.
 *
 * @param tenantId - Tenant identifier.
 */
export async function refreshTenantMetaCacheAfterWrite(
  tenantId: string,
): Promise<void> {
  await invalidateTenantMetaCache(tenantId);
}

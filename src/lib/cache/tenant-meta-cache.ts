import { getRedis } from "@/lib/cache/redis";
import type { TenantProfile } from "@/lib/db/schema";

const TENANT_META_TTL_SEC = 30;

/**
 * Builds the Redis key for cached tenant metadata (namespaced by tenant id).
 *
 * @param tenantId - Tenant UUID used in cache keying.
 */
export function tenantMetaCacheKey(tenantId: string): string {
  return `bostel:tenant:meta:${tenantId}`;
}

/**
 * Reads tenant metadata from Redis if present and JSON-valid.
 *
 * @param tenantId - Tenant id for cache keying.
 * @returns Parsed tenant profile or null when cache miss / parse failure.
 */
export async function getCachedTenantMeta(
  tenantId: string,
): Promise<TenantProfile | null> {
  if (!process.env.REDIS_URL) {
    return null;
  }
  try {
    const raw = await getRedis().get(tenantMetaCacheKey(tenantId));
    if (!raw) return null;
    return JSON.parse(raw) as TenantProfile;
  } catch {
    return null;
  }
}

/**
 * Writes tenant metadata to Redis with a short TTL to reduce database read load.
 *
 * @param tenantId - Tenant id for cache keying.
 * @param item - Tenant profile item (must include `tenantId` matching the key).
 */
export async function setCachedTenantMeta(
  tenantId: string,
  item: TenantProfile,
): Promise<void> {
  if (!process.env.REDIS_URL) {
    return;
  }
  await getRedis().set(
    tenantMetaCacheKey(tenantId),
    JSON.stringify(item),
    "EX",
    TENANT_META_TTL_SEC,
  );
}

/**
 * Invalidates cached tenant metadata after writes that change status or counters.
 *
 * @param tenantId - Tenant id for cache keying.
 */
export async function invalidateTenantMetaCache(
  tenantId: string,
): Promise<void> {
  if (!process.env.REDIS_URL) {
    return;
  }
  await getRedis().del(tenantMetaCacheKey(tenantId));
}

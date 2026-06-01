import { errEnvelope, jsonEnvelope } from "@/lib/api/response";
import { getSessionUserFromCookies } from "@/lib/auth/session";
import { queryOne } from "@/lib/db/postgres";

export async function getSessionUserId(): Promise<string | null> {
  const user = await getSessionUserFromCookies();
  return user?.id ?? null;
}

export async function userHasTenantAccess(
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM public.tenant_members
     WHERE user_id = $1 AND tenant_id = $2
     LIMIT 1`,
    [userId, tenantId],
  );
  return Boolean(row);
}

export type TenantApiAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

/**
 * For Route Handlers: require session and membership on `tenantId`.
 */
export async function requireTenantApiAccess(
  tenantId: string,
): Promise<TenantApiAuthResult> {
  const userId = await getSessionUserId();
  if (!userId) {
    return {
      ok: false,
      response: jsonEnvelope(
        errEnvelope({
          code: "UNAUTHORIZED",
          message: "Sign in required",
        }),
        { status: 401 },
      ),
    };
  }
  const allowed = await userHasTenantAccess(userId, tenantId);
  if (!allowed) {
    return {
      ok: false,
      response: jsonEnvelope(
        errEnvelope({
          code: "FORBIDDEN",
          message: "Not allowed for this tenant",
        }),
        { status: 403 },
      ),
    };
  }
  return { ok: true, userId };
}

import { createServerAuthClient } from "@/lib/auth/supabase/server";
import { errEnvelope, jsonEnvelope } from "@/lib/api/response";
import { createServerSupabase } from "@/lib/db/supabase-server";

export async function getSessionUserId(): Promise<string | null> {
  const auth = createServerAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  return user?.id ?? null;
}

export async function userHasTenantAccess(
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const db = createServerSupabase();
  const { data, error } = await db
    .from("tenant_members")
    .select("id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

export type TenantApiAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

/**
 * For Route Handlers: require a Supabase session and membership on `tenantId`.
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

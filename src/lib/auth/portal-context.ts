import { createServerAuthClient } from "@/lib/auth/supabase/server";
import { createServerSupabase } from "@/lib/db/supabase-server";
import type { TenantPortalAccountStatus } from "@/lib/tenant-portal/demo-context";

export type PortalTenantContext = {
  userId: string;
  tenantId: string;
  tenantDisplayId: string;
  accountName: string;
  accountStatus: TenantPortalAccountStatus;
};

/**
 * Primary tenant for an auth user (first membership row).
 */
export async function getPortalTenantContextForUserId(
  userId: string,
): Promise<PortalTenantContext | null> {
  const db = createServerSupabase();
  const { data: member, error: mErr } = await db
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (mErr || !member?.tenant_id) return null;

  const tenantId = member.tenant_id as string;

  const { data: tenant, error: tErr } = await db
    .from("tenants")
    .select("id, external_id, account_name, status")
    .eq("id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (tErr || !tenant) return null;

  const status = tenant.status as string;
  const accountStatus: TenantPortalAccountStatus =
    status === "ACTIVE" ? "ACTIVE" : "INACTIVE";

  return {
    userId,
    tenantId,
    tenantDisplayId: String(tenant.external_id),
    accountName: String(tenant.account_name ?? ""),
    accountStatus,
  };
}

/**
 * Resolves the signed-in user and their primary tenant (first membership row).
 */
export async function getPortalTenantContext(): Promise<PortalTenantContext | null> {
  const auth = createServerAuthClient();
  const {
    data: { user },
    error,
  } = await auth.auth.getUser();
  if (error || !user) return null;
  return getPortalTenantContextForUserId(user.id);
}

import { getSessionUserFromCookies } from "@/lib/auth/session";
import { queryOne } from "@/lib/db/postgres";
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
  const member = await queryOne<{ tenant_id: string }>(
    `SELECT tenant_id FROM public.tenant_members
     WHERE user_id = $1
     ORDER BY created_at ASC
     LIMIT 1`,
    [userId],
  );
  if (!member?.tenant_id) return null;

  const tenant = await queryOne<{
    id: string;
    external_id: string;
    account_name: string;
    status: string;
  }>(
    `SELECT id, external_id, account_name, status
     FROM public.tenants
     WHERE id = $1 AND deleted_at IS NULL`,
    [member.tenant_id],
  );
  if (!tenant) return null;

  const status =
    tenant.status === "ACTIVE" || tenant.status === "INACTIVE"
      ? tenant.status
      : "ACTIVE";

  return {
    userId,
    tenantId: tenant.id,
    tenantDisplayId: tenant.external_id,
    accountName: tenant.account_name,
    accountStatus: status,
  };
}

export async function getPortalTenantContext(): Promise<PortalTenantContext | null> {
  const user = await getSessionUserFromCookies();
  if (!user) return null;
  return getPortalTenantContextForUserId(user.id);
}

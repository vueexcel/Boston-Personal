import { query, queryOne } from "@/lib/db/postgres";
import { ensureOpenBillingPeriod } from "@/lib/services/tenant-billing";

export type ProvisionTenantResult = {
  tenantId: string;
  externalId: string;
};

/**
 * Creates tenant, entitlements, and membership for a new user (signup).
 */
export async function provisionTenantForUser(
  userId: string,
  accountName: string,
): Promise<ProvisionTenantResult> {
  const acct =
    accountName.trim() ||
    "Account";

  const extRow = await queryOne<{ ext_id: string }>(
    `SELECT 'TEN-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 10)) AS ext_id`,
  );
  const extId = extRow?.ext_id ?? `TEN-${Date.now()}`;

  const tenant = await queryOne<{ id: string }>(
    `INSERT INTO public.tenants (external_id, account_name, status, plan_code, settings)
     VALUES ($1, $2, 'ACTIVE', 'PACKAGE_1', '{}'::jsonb)
     RETURNING id`,
    [extId, acct],
  );
  if (!tenant) throw new Error("Failed to create tenant");

  await query(
    `INSERT INTO public.tenant_entitlements (
       tenant_id, max_agents, max_phone_numbers, allowed_features, overage_policy
     ) VALUES ($1, 10, 5, '{}'::jsonb, 'BLOCK')`,
    [tenant.id],
  );

  await query(
    `INSERT INTO public.tenant_members (tenant_id, user_id, role)
     VALUES ($1, $2, 'TENANT_ADMIN')`,
    [tenant.id, userId],
  );

  await ensureOpenBillingPeriod(tenant.id);

  return { tenantId: tenant.id, externalId: extId };
}

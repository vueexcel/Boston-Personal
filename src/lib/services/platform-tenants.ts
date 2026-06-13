import { query, queryOne } from "@/lib/db/postgres";
import {
  mergeTenantSettings,
  parseTenantProfileSettings,
  type TenantProfileSettings,
} from "@/lib/db/tenant-settings";
import { normalizeTenantPlanCode } from "@/lib/db/tenant-plans";
import { tenantStatusSchema } from "@/lib/db/enums";
import { hashPassword } from "@/lib/auth/password";
import { refreshTenantMetaCacheAfterWrite } from "@/lib/services/tenant";
import { randomBytes } from "node:crypto";
import type { z } from "zod";

export type TenantStatus = z.infer<typeof tenantStatusSchema>;

export type AdminTenantListRow = {
  tenantId: string;
  displayTenantId: string;
  accountName: string;
  companyName: string;
  planCode: string;
  status: TenantStatus;
  agentCount: number;
  callCount: number;
  minutesUsed30d: number;
  createdAt: string;
  maxAgents: number;
  maxPhoneNumbers: number;
};

export type AdminTenantDetail = AdminTenantListRow & {
  settings: TenantProfileSettings;
  totalCalls: number;
  minutesUsedAllTime: number;
  activeAgents: number;
  primaryAdminUserId: string | null;
  primaryAdminEmail: string | null;
};

type ListDbRow = {
  id: string;
  external_id: string;
  account_name: string;
  plan_code: string;
  status: TenantStatus;
  settings: unknown;
  created_at: Date | string;
  agent_count: number;
  call_count: number;
  minutes_30d: number;
  max_agents: number;
  max_phone_numbers: number;
};

function toIso(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

function companyNameFromSettings(settings: unknown): string {
  const parsed = parseTenantProfileSettings(settings);
  return parsed.company.name || "";
}

export async function listPlatformTenants(input: {
  search?: string;
  status?: TenantStatus;
  page?: number;
  limit?: number;
}): Promise<{ tenants: AdminTenantListRow[]; total: number }> {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(1, input.limit ?? 25));
  const offset = (page - 1) * limit;
  const search = input.search?.trim() ?? "";
  const status = input.status;

  const conditions: string[] = ["t.deleted_at IS NULL"];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (search) {
    conditions.push(
      `(t.account_name ILIKE $${paramIdx} OR t.external_id ILIKE $${paramIdx} OR t.settings->'company'->>'name' ILIKE $${paramIdx})`,
    );
    params.push(`%${search}%`);
    paramIdx++;
  }

  if (status) {
    conditions.push(`t.status = $${paramIdx}`);
    params.push(status);
    paramIdx++;
  }

  const where = conditions.join(" AND ");

  const countRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM public.tenants t WHERE ${where}`,
    params,
  );

  const { rows } = await query<ListDbRow>(
    `SELECT
       t.id,
       t.external_id,
       t.account_name,
       t.plan_code,
       t.status,
       t.settings,
       t.created_at,
       COALESCE(a.agent_count, 0)::int AS agent_count,
       COALESCE(c.call_count, 0)::int AS call_count,
       COALESCE(c.minutes_30d, 0)::int AS minutes_30d,
       COALESCE(e.max_agents, 0)::int AS max_agents,
       COALESCE(e.max_phone_numbers, 0)::int AS max_phone_numbers
     FROM public.tenants t
     LEFT JOIN public.tenant_entitlements e ON e.tenant_id = t.id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS agent_count
       FROM public.agents ag
       WHERE ag.tenant_id = t.id AND ag.deleted_at IS NULL
     ) a ON true
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*)::int AS call_count,
         COALESCE(SUM(duration) FILTER (
           WHERE started_at >= now() - interval '30 days'
         ), 0)::int AS minutes_30d
       FROM public.call_logs cl
       WHERE cl.tenant_id = t.id AND cl.deleted_at IS NULL
     ) c ON true
     WHERE ${where}
     ORDER BY t.created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset],
  );

  return {
    total: countRow?.count ?? 0,
    tenants: rows.map((row) => ({
      tenantId: row.id,
      displayTenantId: row.external_id,
      accountName: row.account_name,
      companyName: companyNameFromSettings(row.settings),
      planCode: normalizeTenantPlanCode(row.plan_code),
      status: row.status,
      agentCount: row.agent_count,
      callCount: row.call_count,
      minutesUsed30d: Math.round(row.minutes_30d / 60),
      createdAt: toIso(row.created_at),
      maxAgents: row.max_agents,
      maxPhoneNumbers: row.max_phone_numbers,
    })),
  };
}

export async function getPlatformTenantDetail(
  tenantId: string,
): Promise<AdminTenantDetail | null> {
  const row = await queryOne<
    ListDbRow & {
      total_calls: number;
      minutes_all_time: number;
      active_agents: number;
    }
  >(
    `SELECT
       t.id,
       t.external_id,
       t.account_name,
       t.plan_code,
       t.status,
       t.settings,
       t.created_at,
       COALESCE(a.agent_count, 0)::int AS agent_count,
       COALESCE(c.call_count, 0)::int AS call_count,
       COALESCE(c.minutes_30d, 0)::int AS minutes_30d,
       COALESCE(c.total_calls, 0)::int AS total_calls,
       COALESCE(c.minutes_all_time, 0)::int AS minutes_all_time,
       COALESCE(a.active_agents, 0)::int AS active_agents,
       COALESCE(e.max_agents, 0)::int AS max_agents,
       COALESCE(e.max_phone_numbers, 0)::int AS max_phone_numbers
     FROM public.tenants t
     LEFT JOIN public.tenant_entitlements e ON e.tenant_id = t.id
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*)::int AS agent_count,
         COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_agents
       FROM public.agents ag
       WHERE ag.tenant_id = t.id AND ag.deleted_at IS NULL
     ) a ON true
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*)::int AS call_count,
         COALESCE(SUM(duration) FILTER (
           WHERE started_at >= now() - interval '30 days'
         ), 0)::int AS minutes_30d,
         COUNT(*)::int AS total_calls,
         COALESCE(SUM(duration), 0)::int AS minutes_all_time
       FROM public.call_logs cl
       WHERE cl.tenant_id = t.id AND cl.deleted_at IS NULL
     ) c ON true
     WHERE t.id = $1 AND t.deleted_at IS NULL`,
    [tenantId],
  );

  if (!row) return null;

  const adminUser = await queryOne<{ user_id: string; email: string }>(
    `SELECT tm.user_id, u.email
     FROM public.tenant_members tm
     JOIN public.users u ON u.id = tm.user_id
     WHERE tm.tenant_id = $1
       AND tm.role = 'TENANT_ADMIN'
       AND u.deleted_at IS NULL
     ORDER BY tm.created_at ASC
     LIMIT 1`,
    [tenantId],
  );

  const settings = parseTenantProfileSettings(row.settings);
  const primaryAdminEmail = adminUser?.email ?? null;

  return {
    tenantId: row.id,
    displayTenantId: row.external_id,
    accountName: row.account_name,
    companyName: companyNameFromSettings(row.settings),
    planCode: normalizeTenantPlanCode(row.plan_code),
    status: row.status,
    agentCount: row.agent_count,
    callCount: row.call_count,
    minutesUsed30d: Math.round(row.minutes_30d / 60),
    createdAt: toIso(row.created_at),
    maxAgents: row.max_agents,
    maxPhoneNumbers: row.max_phone_numbers,
    settings,
    totalCalls: row.total_calls,
    minutesUsedAllTime: Math.round(row.minutes_all_time / 60),
    activeAgents: row.active_agents,
    primaryAdminUserId: adminUser?.user_id ?? null,
    primaryAdminEmail,
  };
}

export type UpdatePlatformTenantInput = {
  accountName?: string;
  planCode?: string;
  status?: TenantStatus;
  settings?: Partial<TenantProfileSettings>;
  maxAgents?: number;
  maxPhoneNumbers?: number;
};

export async function updatePlatformTenant(
  tenantId: string,
  input: UpdatePlatformTenantInput,
): Promise<AdminTenantDetail | null> {
  const existing = await queryOne<{ settings: unknown }>(
    `SELECT settings FROM public.tenants WHERE id = $1 AND deleted_at IS NULL`,
    [tenantId],
  );
  if (!existing) return null;

  const mergedSettings = input.settings
    ? mergeTenantSettings(existing.settings, input.settings)
    : undefined;

  if (input.accountName !== undefined) {
    await query(
      `UPDATE public.tenants SET account_name = $2 WHERE id = $1`,
      [tenantId, input.accountName.trim()],
    );
  }
  if (input.planCode !== undefined) {
    await query(`UPDATE public.tenants SET plan_code = $2 WHERE id = $1`, [
      tenantId,
      normalizeTenantPlanCode(input.planCode),
    ]);
  }
  if (input.status !== undefined) {
    await query(
      `UPDATE public.tenants SET status = $2::public.tenant_status WHERE id = $1`,
      [tenantId, input.status],
    );
  }
  if (mergedSettings) {
    await query(`UPDATE public.tenants SET settings = $2::jsonb WHERE id = $1`, [
      tenantId,
      JSON.stringify(mergedSettings),
    ]);
  }
  if (input.maxAgents !== undefined || input.maxPhoneNumbers !== undefined) {
    const maxAgents = input.maxAgents ?? 0;
    const maxPhoneNumbers = input.maxPhoneNumbers ?? 0;
    await query(
      `INSERT INTO public.tenant_entitlements (
         tenant_id, max_agents, max_phone_numbers, allowed_features, overage_policy
       ) VALUES ($1, $2, $3, '{}'::jsonb, 'BLOCK')
       ON CONFLICT (tenant_id) DO UPDATE SET
         max_agents = COALESCE($2, public.tenant_entitlements.max_agents),
         max_phone_numbers = COALESCE($3, public.tenant_entitlements.max_phone_numbers),
         updated_at = now()`,
      [
        tenantId,
        input.maxAgents !== undefined ? maxAgents : null,
        input.maxPhoneNumbers !== undefined ? maxPhoneNumbers : null,
      ],
    );
  }

  await refreshTenantMetaCacheAfterWrite(tenantId);
  return getPlatformTenantDetail(tenantId);
}

export async function softDeletePlatformTenant(
  tenantId: string,
): Promise<boolean> {
  const result = await query(
    `UPDATE public.tenants SET deleted_at = now(), status = 'INACTIVE'
     WHERE id = $1 AND deleted_at IS NULL`,
    [tenantId],
  );
  if ((result.rowCount ?? 0) > 0) {
    await refreshTenantMetaCacheAfterWrite(tenantId);
    return true;
  }
  return false;
}

function generateTemporaryPassword(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

export async function resetTenantAdminPassword(
  tenantId: string,
  password?: string,
): Promise<{ userId: string; email: string; temporaryPassword: string } | null> {
  const adminUser = await queryOne<{ user_id: string; email: string }>(
    `SELECT tm.user_id, u.email
     FROM public.tenant_members tm
     JOIN public.users u ON u.id = tm.user_id
     WHERE tm.tenant_id = $1
       AND tm.role = 'TENANT_ADMIN'
       AND u.deleted_at IS NULL
     ORDER BY tm.created_at ASC
     LIMIT 1`,
    [tenantId],
  );
  if (!adminUser) return null;

  const temporaryPassword = password?.trim() || generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await query(
    `UPDATE public.users SET password_hash = $2 WHERE id = $1`,
    [adminUser.user_id, passwordHash],
  );

  return {
    userId: adminUser.user_id,
    email: adminUser.email,
    temporaryPassword,
  };
}

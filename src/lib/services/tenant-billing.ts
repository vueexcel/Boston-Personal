import type { CostingSettings } from "@/lib/db/costing-settings";
import {
  computePostpaidInvoiceCents,
  POSTPAID_SECONDS_LIMIT,
  type BillingUsageSummary,
} from "@/lib/db/tenant-billing";
import {
  normalizeTenantPlanCode,
  type TenantPlanCode,
} from "@/lib/db/tenant-plans";
import { query, queryOne } from "@/lib/db/postgres";
import { parseTenantProfileSettings } from "@/lib/db/tenant-settings";
import { getCostingSettings } from "@/lib/services/costing-settings";
import { normalizeTimezone } from "@/lib/services/routing-schedule";

type BillingAccountRow = {
  tenant_id: string;
  billing_anchor_at: Date | string;
  timezone: string;
};

type BillingPeriodRow = {
  id: string;
  tenant_id: string;
  period_start: Date | string;
  period_end: Date | string;
  plan_code: string;
  package_seconds_limit: number;
  package_seconds_used: number;
  postpaid_seconds_limit: number;
  postpaid_seconds_used: number;
  status: "OPEN" | "CLOSED" | "INVOICED";
  invoice_postpaid_seconds: number | null;
  invoice_amount_cents: number | null;
  invoiced_at: Date | string | null;
};

type AllocationRow = {
  id: string;
  call_log_id: string;
  billing_period_id: string;
  tenant_id: string;
  duration_seconds: number;
  package_seconds: number;
  postpaid_seconds: number;
  overage_seconds: number;
};

type LastInvoiceRow = {
  amount_cents: number;
  postpaid_seconds_billed: number;
  created_at: Date | string;
  line_description: string;
};

export type AllocateCallUsageInput = {
  tenantId: string;
  callLogId: string;
  durationSeconds: number;
  endedAt?: Date;
  callStatus?: string;
};

export type AllocateCallUsageResult = {
  allocated: boolean;
  skippedReason?: "zero_duration" | "not_billable_status" | "already_allocated";
  allocation?: AllocationRow;
};

export type CanTenantAcceptUsageResult = {
  allowed: boolean;
  alertOnly: boolean;
  packageSecondsRemaining: number;
  postpaidSecondsRemaining: number;
};

function toIso(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

const BILLABLE_STATUSES = new Set(["COMPLETED", "FAILED"]);

export function getPackageSecondsLimit(
  planCode: TenantPlanCode,
  costing: Pick<CostingSettings, "package1Hours" | "package2Hours">,
): number {
  if (planCode === "PACKAGE_2") {
    return Math.round(costing.package2Hours * 3600);
  }
  if (planCode === "PAYG") {
    return 0;
  }
  return Math.round(costing.package1Hours * 3600);
}

function computeWaterfall(
  durationSeconds: number,
  packageSecondsLimit: number,
  packageSecondsUsed: number,
  postpaidSecondsLimit: number,
  postpaidSecondsUsed: number,
): {
  packageSeconds: number;
  postpaidSeconds: number;
  overageSeconds: number;
} {
  let remaining = Math.max(0, Math.floor(durationSeconds));
  const pkgAvail = Math.max(0, packageSecondsLimit - packageSecondsUsed);
  const pkgTake = Math.min(remaining, pkgAvail);
  remaining -= pkgTake;

  const postAvail = Math.max(0, postpaidSecondsLimit - postpaidSecondsUsed);
  const postTake = Math.min(remaining, postAvail);
  remaining -= postTake;

  return {
    packageSeconds: pkgTake,
    postpaidSeconds: postTake,
    overageSeconds: remaining,
  };
}

async function loadTenantPlanCode(tenantId: string): Promise<TenantPlanCode> {
  const row = await queryOne<{ plan_code: string }>(
    `SELECT plan_code FROM public.tenants WHERE id = $1 AND deleted_at IS NULL`,
    [tenantId],
  );
  return normalizeTenantPlanCode(row?.plan_code ?? "PACKAGE_1");
}

async function addOneMonth(periodStartIso: string): Promise<string> {
  const row = await queryOne<{ period_end: Date | string }>(
    `SELECT ($1::timestamptz + interval '1 month') AS period_end`,
    [periodStartIso],
  );
  return toIso(row?.period_end ?? new Date());
}

async function getBillingAccount(
  tenantId: string,
): Promise<BillingAccountRow | null> {
  return queryOne<BillingAccountRow>(
    `SELECT tenant_id, billing_anchor_at, timezone
     FROM public.tenant_billing_accounts
     WHERE tenant_id = $1`,
    [tenantId],
  );
}

async function getOpenPeriod(tenantId: string): Promise<BillingPeriodRow | null> {
  return queryOne<BillingPeriodRow>(
    `SELECT id, tenant_id, period_start, period_end, plan_code,
            package_seconds_limit, package_seconds_used,
            postpaid_seconds_limit, postpaid_seconds_used,
            status, invoice_postpaid_seconds, invoice_amount_cents, invoiced_at
     FROM public.tenant_billing_periods
     WHERE tenant_id = $1 AND status = 'OPEN'
     ORDER BY period_start DESC
     LIMIT 1`,
    [tenantId],
  );
}

async function openBillingPeriod(
  tenantId: string,
  periodStart: string,
  planCode: TenantPlanCode,
  costing: CostingSettings,
): Promise<BillingPeriodRow> {
  const periodEnd = await addOneMonth(periodStart);
  const row = await queryOne<BillingPeriodRow>(
    `INSERT INTO public.tenant_billing_periods (
       tenant_id, period_start, period_end, plan_code,
       package_seconds_limit, postpaid_seconds_limit, status
     ) VALUES ($1, $2::timestamptz, $3::timestamptz, $4, $5, $6, 'OPEN')
     RETURNING id, tenant_id, period_start, period_end, plan_code,
               package_seconds_limit, package_seconds_used,
               postpaid_seconds_limit, postpaid_seconds_used,
               status, invoice_postpaid_seconds, invoice_amount_cents, invoiced_at`,
    [
      tenantId,
      periodStart,
      periodEnd,
      planCode,
      getPackageSecondsLimit(planCode, costing),
      POSTPAID_SECONDS_LIMIT,
    ],
  );
  if (!row) throw new Error("Failed to open billing period");
  return row;
}

/**
 * Creates billing account (if missing) and ensures an open billing period exists.
 */
export async function ensureOpenBillingPeriod(
  tenantId: string,
  anchorAt?: Date,
): Promise<BillingPeriodRow> {
  const costing = await getCostingSettings();
  let account = await getBillingAccount(tenantId);

  if (!account) {
    const tenantRow = await queryOne<{
      created_at: Date | string;
      settings: unknown;
    }>(
      `SELECT created_at, settings FROM public.tenants WHERE id = $1 AND deleted_at IS NULL`,
      [tenantId],
    );
    if (!tenantRow) throw new Error("Tenant not found");

    const anchor = anchorAt ?? new Date(toIso(tenantRow.created_at));
    const tz = normalizeTimezone(
      parseTenantProfileSettings(tenantRow.settings).timezone,
    );

    account = await queryOne<BillingAccountRow>(
      `INSERT INTO public.tenant_billing_accounts (tenant_id, billing_anchor_at, timezone)
       VALUES ($1, $2::timestamptz, $3)
       ON CONFLICT (tenant_id) DO UPDATE SET updated_at = now()
       RETURNING tenant_id, billing_anchor_at, timezone`,
      [tenantId, anchor.toISOString(), tz],
    );
    if (!account) throw new Error("Failed to create billing account");
  }

  let open = await getOpenPeriod(tenantId);
  if (open) return open;

  const lastClosed = await queryOne<{ period_end: Date | string }>(
    `SELECT period_end FROM public.tenant_billing_periods
     WHERE tenant_id = $1 AND status IN ('CLOSED', 'INVOICED')
     ORDER BY period_end DESC LIMIT 1`,
    [tenantId],
  );

  const periodStart = lastClosed
    ? toIso(lastClosed.period_end)
    : toIso(account.billing_anchor_at);
  const planCode = await loadTenantPlanCode(tenantId);
  return openBillingPeriod(tenantId, periodStart, planCode, costing);
}

async function closeBillingPeriod(
  periodId: string,
  paygRate: number,
): Promise<void> {
  const period = await queryOne<BillingPeriodRow>(
    `SELECT id, tenant_id, postpaid_seconds_used, period_start, period_end
     FROM public.tenant_billing_periods WHERE id = $1`,
    [periodId],
  );
  if (!period) return;

  const amountCents = computePostpaidInvoiceCents(
    period.postpaid_seconds_used,
    paygRate,
  );
  const postpaidSeconds = period.postpaid_seconds_used;
  const hours = (postpaidSeconds / 3600).toFixed(2);
  const lineDescription = `Postpaid usage: ${hours}h × $${paygRate.toFixed(2)}/hr`;

  await query(
    `UPDATE public.tenant_billing_periods
     SET status = 'INVOICED',
         invoice_postpaid_seconds = $2,
         invoice_amount_cents = $3,
         invoiced_at = now()
     WHERE id = $1`,
    [periodId, postpaidSeconds, amountCents],
  );

  await query(
    `INSERT INTO public.tenant_billing_invoices (
       tenant_id, billing_period_id, postpaid_seconds_billed,
       rate_per_hour_cents, amount_cents, line_description
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (billing_period_id) DO NOTHING`,
    [
      period.tenant_id,
      periodId,
      postpaidSeconds,
      Math.round(paygRate * 100),
      amountCents,
      lineDescription,
    ],
  );
}

async function rollPeriodsForwardUntil(
  tenantId: string,
  asOf: Date,
): Promise<BillingPeriodRow> {
  const costing = await getCostingSettings();
  let open = await ensureOpenBillingPeriod(tenantId);
  const asOfIso = asOf.toISOString();

  let guard = 0;
  while (toIso(open.period_end) <= asOfIso && guard < 24) {
    await closeBillingPeriod(open.id, costing.paygRate);
    const planCode = await loadTenantPlanCode(tenantId);
    open = await openBillingPeriod(
      tenantId,
      toIso(open.period_end),
      planCode,
      costing,
    );
    guard++;
  }

  return open;
}

export async function closeDueBillingPeriods(
  asOf: Date = new Date(),
): Promise<number> {
  const costing = await getCostingSettings();
  const { rows } = await query<{
    id: string;
    tenant_id: string;
    period_end: Date | string;
  }>(
    `SELECT id, tenant_id, period_end FROM public.tenant_billing_periods
     WHERE status = 'OPEN' AND period_end <= $1::timestamptz`,
    [asOf.toISOString()],
  );

  let closed = 0;
  for (const row of rows) {
    const periodEndIso = toIso(row.period_end);
    await closeBillingPeriod(row.id, costing.paygRate);
    const planCode = await loadTenantPlanCode(row.tenant_id);
    await openBillingPeriod(row.tenant_id, periodEndIso, planCode, costing);
    closed++;
  }

  return closed;
}

export async function allocateCallUsage(
  input: AllocateCallUsageInput,
): Promise<AllocateCallUsageResult> {
  const durationSeconds = Math.max(0, Math.floor(input.durationSeconds));
  if (durationSeconds <= 0) {
    return { allocated: false, skippedReason: "zero_duration" };
  }

  if (input.callStatus && !BILLABLE_STATUSES.has(input.callStatus)) {
    return { allocated: false, skippedReason: "not_billable_status" };
  }

  const existing = await queryOne<AllocationRow>(
    `SELECT id, call_log_id, billing_period_id, tenant_id, duration_seconds,
            package_seconds, postpaid_seconds, overage_seconds
     FROM public.tenant_billing_call_allocations
     WHERE call_log_id = $1`,
    [input.callLogId],
  );
  if (existing) {
    return {
      allocated: true,
      skippedReason: "already_allocated",
      allocation: existing,
    };
  }

  const endedAt = input.endedAt ?? new Date();
  const period = await rollPeriodsForwardUntil(input.tenantId, endedAt);

  const split = computeWaterfall(
    durationSeconds,
    period.package_seconds_limit,
    period.package_seconds_used,
    period.postpaid_seconds_limit,
    period.postpaid_seconds_used,
  );

  try {
    const allocation = await queryOne<AllocationRow>(
      `WITH ins AS (
         INSERT INTO public.tenant_billing_call_allocations (
           call_log_id, billing_period_id, tenant_id, duration_seconds,
           package_seconds, postpaid_seconds, overage_seconds
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (call_log_id) DO NOTHING
         RETURNING id, call_log_id, billing_period_id, tenant_id, duration_seconds,
                   package_seconds, postpaid_seconds, overage_seconds
       )
       SELECT * FROM ins`,
      [
        input.callLogId,
        period.id,
        input.tenantId,
        durationSeconds,
        split.packageSeconds,
        split.postpaidSeconds,
        split.overageSeconds,
      ],
    );

    if (!allocation) {
      const raced = await queryOne<AllocationRow>(
        `SELECT id, call_log_id, billing_period_id, tenant_id, duration_seconds,
                package_seconds, postpaid_seconds, overage_seconds
         FROM public.tenant_billing_call_allocations
         WHERE call_log_id = $1`,
        [input.callLogId],
      );
      return {
        allocated: true,
        skippedReason: "already_allocated",
        allocation: raced ?? undefined,
      };
    }

    await query(
      `UPDATE public.tenant_billing_periods
       SET package_seconds_used = package_seconds_used + $2,
           postpaid_seconds_used = postpaid_seconds_used + $3
       WHERE id = $1`,
      [period.id, split.packageSeconds, split.postpaidSeconds],
    );

    return { allocated: true, allocation };
  } catch (e) {
    console.error("[tenant-billing] allocate failed", e);
    throw e;
  }
}

export async function getOpenPeriodSummary(
  tenantId: string,
): Promise<BillingUsageSummary | null> {
  const costing = await getCostingSettings();
  const open = await ensureOpenBillingPeriod(tenantId);

  const lastInvoice = await queryOne<LastInvoiceRow>(
    `SELECT i.amount_cents, i.postpaid_seconds_billed, i.created_at, i.line_description
     FROM public.tenant_billing_invoices i
     JOIN public.tenant_billing_periods p ON p.id = i.billing_period_id
     WHERE i.tenant_id = $1
     ORDER BY i.created_at DESC
     LIMIT 1`,
    [tenantId],
  );

  const estimatedBillCents = computePostpaidInvoiceCents(
    open.postpaid_seconds_used,
    costing.paygRate,
  );

  return {
    periodId: open.id,
    periodStart: toIso(open.period_start),
    periodEnd: toIso(open.period_end),
    planCode: normalizeTenantPlanCode(open.plan_code),
    packageSecondsLimit: open.package_seconds_limit,
    packageSecondsUsed: open.package_seconds_used,
    postpaidSecondsLimit: open.postpaid_seconds_limit,
    postpaidSecondsUsed: open.postpaid_seconds_used,
    estimatedBillCents,
    paygRatePerHour: costing.paygRate,
    lastInvoice: lastInvoice
      ? {
          amountCents: lastInvoice.amount_cents,
          postpaidSecondsBilled: lastInvoice.postpaid_seconds_billed,
          createdAt: toIso(lastInvoice.created_at),
          lineDescription: lastInvoice.line_description,
        }
      : null,
  };
}

export async function canTenantAcceptUsage(
  tenantId: string,
): Promise<CanTenantAcceptUsageResult> {
  const summary = await getOpenPeriodSummary(tenantId);
  if (!summary) {
    return {
      allowed: true,
      alertOnly: false,
      packageSecondsRemaining: 0,
      postpaidSecondsRemaining: 0,
    };
  }

  const packageSecondsRemaining = Math.max(
    0,
    summary.packageSecondsLimit - summary.packageSecondsUsed,
  );
  const postpaidSecondsRemaining = Math.max(
    0,
    summary.postpaidSecondsLimit - summary.postpaidSecondsUsed,
  );

  if (packageSecondsRemaining > 0 || postpaidSecondsRemaining > 0) {
    return {
      allowed: true,
      alertOnly: false,
      packageSecondsRemaining,
      postpaidSecondsRemaining,
    };
  }

  const ent = await queryOne<{ overage_policy: string }>(
    `SELECT overage_policy FROM public.tenant_entitlements WHERE tenant_id = $1`,
    [tenantId],
  );
  const allowOverage = ent?.overage_policy === "ALLOW_WITH_ALERT";

  return {
    allowed: allowOverage,
    alertOnly: allowOverage,
    packageSecondsRemaining: 0,
    postpaidSecondsRemaining: 0,
  };
}

/** Exported for unit tests. */
export const __test__ = {
  computeWaterfall,
  getPackageSecondsLimit,
  computePostpaidInvoiceCents,
};

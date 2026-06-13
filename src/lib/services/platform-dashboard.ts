import { query } from "@/lib/db/postgres";
import { formatMinutesUsed } from "@/lib/services/portal-dashboard";

export type PlatformDashboardKpis = {
  totalTenants: number;
  activeTenants: number;
  newTenantsThisMonth: number;
  totalCalls: number;
  callsToday: number;
  minutesConsumed30d: number;
  minutesConsumedAllTime: number;
  activeAgents: number;
};

export type TimeSeriesPoint = {
  date: string;
  value: number;
};

export type TenantUsageBar = {
  tenantId: string;
  accountName: string;
  minutes: number;
};

export type CallOutcomeSlice = {
  label: string;
  value: number;
};

export type PlatformDashboardData = {
  kpis: PlatformDashboardKpis;
  tenantGrowth: TimeSeriesPoint[];
  callVolumeTrend: TimeSeriesPoint[];
  usageTrend: TimeSeriesPoint[];
  callOutcomes: CallOutcomeSlice[];
  tenantUsageDistribution: TenantUsageBar[];
};

type TenantKpiRow = {
  total_tenants: number;
  active_tenants: number;
  new_tenants_this_month: number;
};

type CallKpiRow = {
  total_calls: number;
  calls_today: number;
  minutes_30d: number;
  minutes_all_time: number;
};

type AgentKpiRow = {
  active_agents: number;
};

type MonthlyTenantRow = {
  month: string;
  count: number;
};

type DailyCallRow = {
  day: string;
  count: number;
  seconds: number;
};

type OutcomeRow = {
  completed: number;
  failed_missed: number;
};

type TenantUsageRow = {
  tenant_id: string;
  account_name: string;
  seconds: number;
};

export async function getPlatformDashboardData(): Promise<PlatformDashboardData> {
  const [
    tenantKpis,
    callKpis,
    agentKpis,
    tenantGrowthRows,
    dailyCallRows,
    outcomeRow,
    tenantUsageRows,
  ] = await Promise.all([
    query<TenantKpiRow>(
      `SELECT
         COUNT(*)::int AS total_tenants,
         COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_tenants,
         COUNT(*) FILTER (
           WHERE created_at >= date_trunc('month', now())
         )::int AS new_tenants_this_month
       FROM public.tenants
       WHERE deleted_at IS NULL`,
    ),
    query<CallKpiRow>(
      `SELECT
         COUNT(*)::int AS total_calls,
         COUNT(*) FILTER (
           WHERE started_at >= date_trunc('day', now())
         )::int AS calls_today,
         COALESCE(SUM(duration) FILTER (
           WHERE started_at >= now() - interval '30 days'
         ), 0)::int AS minutes_30d,
         COALESCE(SUM(duration), 0)::int AS minutes_all_time
       FROM public.call_logs
       WHERE deleted_at IS NULL`,
    ),
    query<AgentKpiRow>(
      `SELECT COUNT(*)::int AS active_agents
       FROM public.agents
       WHERE status = 'ACTIVE' AND deleted_at IS NULL`,
    ),
    query<MonthlyTenantRow>(
      `SELECT
         to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
         COUNT(*)::int AS count
       FROM public.tenants
       WHERE deleted_at IS NULL
         AND created_at >= date_trunc('month', now() - interval '11 months')
       GROUP BY 1
       ORDER BY 1`,
    ),
    query<DailyCallRow>(
      `SELECT
         to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS day,
         COUNT(*)::int AS count,
         COALESCE(SUM(duration), 0)::int AS seconds
       FROM public.call_logs
       WHERE deleted_at IS NULL
         AND started_at >= now() - interval '30 days'
       GROUP BY 1
       ORDER BY 1`,
    ),
    query<OutcomeRow>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
         COUNT(*) FILTER (WHERE status IN ('MISSED', 'FAILED'))::int AS failed_missed
       FROM public.call_logs
       WHERE deleted_at IS NULL
         AND started_at >= now() - interval '30 days'`,
    ),
    query<TenantUsageRow>(
      `SELECT
         t.id AS tenant_id,
         t.account_name,
         COALESCE(SUM(c.duration), 0)::int AS seconds
       FROM public.tenants t
       LEFT JOIN public.call_logs c
         ON c.tenant_id = t.id
         AND c.deleted_at IS NULL
         AND c.started_at >= now() - interval '30 days'
       WHERE t.deleted_at IS NULL
       GROUP BY t.id, t.account_name
       ORDER BY seconds DESC
       LIMIT 10`,
    ),
  ]);

  const tk = tenantKpis.rows[0];
  const ck = callKpis.rows[0];
  const ak = agentKpis.rows[0];
  const oc = outcomeRow.rows[0];

  return {
    kpis: {
      totalTenants: tk?.total_tenants ?? 0,
      activeTenants: tk?.active_tenants ?? 0,
      newTenantsThisMonth: tk?.new_tenants_this_month ?? 0,
      totalCalls: ck?.total_calls ?? 0,
      callsToday: ck?.calls_today ?? 0,
      minutesConsumed30d: Math.round((ck?.minutes_30d ?? 0) / 60),
      minutesConsumedAllTime: Math.round((ck?.minutes_all_time ?? 0) / 60),
      activeAgents: ak?.active_agents ?? 0,
    },
    tenantGrowth: tenantGrowthRows.rows.map((r) => ({
      date: r.month,
      value: r.count,
    })),
    callVolumeTrend: dailyCallRows.rows.map((r) => ({
      date: r.day,
      value: r.count,
    })),
    usageTrend: dailyCallRows.rows.map((r) => ({
      date: r.day,
      value: Math.round(r.seconds / 60),
    })),
    callOutcomes: [
      { label: "Completed", value: oc?.completed ?? 0 },
      { label: "Failed / Missed", value: oc?.failed_missed ?? 0 },
    ],
    tenantUsageDistribution: tenantUsageRows.rows.map((r) => ({
      tenantId: r.tenant_id,
      accountName: r.account_name,
      minutes: Math.round(r.seconds / 60),
    })),
  };
}

export { formatMinutesUsed };

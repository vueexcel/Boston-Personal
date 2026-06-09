import { dispositionLabel } from "@/lib/services/call-metadata";
import { query, queryOne } from "@/lib/db/postgres";
import { formatPhoneNumberDisplay } from "@/lib/utils/phone-format";

export type PortalDashboardStats = {
  totalCalls: number;
  callsThisMonth: number;
  callsLastMonth: number;
  activeAgents: number;
  draftAgents: number;
  secondsLast30Days: number;
  completedLast7Days: number;
  missedFailedLast7Days: number;
};

export type RecentInboundCallRow = {
  callId: string;
  callerNumber: string;
  agentName: string | null;
  status: string;
  disposition: string | null;
  startedAt: string;
  detail: string;
  statusLabel: string;
  timeUtc: string;
};

type CallStatsRow = {
  total_calls: number;
  calls_this_month: number;
  calls_last_month: number;
  seconds_last_30_days: number;
  completed_last_7_days: number;
  missed_failed_last_7_days: number;
};

type AgentStatsRow = {
  active_agents: number;
  draft_agents: number;
};

type RecentCallDbRow = {
  id: string;
  caller_number: string;
  status: string;
  disposition: string | null;
  started_at: Date | string;
  agent_name: string | null;
};

export function formatMonthOverMonthSubtitle(
  thisMonth: number,
  lastMonth: number,
): string {
  if (thisMonth === 0 && lastMonth === 0) return "No calls yet this month";
  if (lastMonth === 0) {
    return thisMonth === 1
      ? "1 call this month"
      : `${thisMonth.toLocaleString()} calls this month`;
  }
  const pct = ((thisMonth - lastMonth) / lastMonth) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}% vs last month`;
}

export function formatMinutesUsed(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return minutes.toLocaleString();
}

export function formatAnswerRate(
  completed: number,
  missedFailed: number,
): string {
  const total = completed + missedFailed;
  if (total === 0) return "—";
  return `${((completed / total) * 100).toFixed(1)}%`;
}

export function formatDraftAgentsSubtitle(drafts: number): string {
  if (drafts === 0) return "No drafts";
  return drafts === 1 ? "1 draft" : `${drafts} drafts`;
}

export function formatUtcTimestamp(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${min} UTC`;
}

export async function getPortalDashboardStats(
  tenantId: string,
): Promise<PortalDashboardStats> {
  const [callStats, agentStats] = await Promise.all([
    queryOne<CallStatsRow>(
      `SELECT
         COUNT(*)::int AS total_calls,
         COUNT(*) FILTER (
           WHERE started_at >= date_trunc('month', now())
         )::int AS calls_this_month,
         COUNT(*) FILTER (
           WHERE started_at >= date_trunc('month', now() - interval '1 month')
             AND started_at < date_trunc('month', now())
         )::int AS calls_last_month,
         COALESCE(SUM(duration) FILTER (
           WHERE started_at >= now() - interval '30 days'
         ), 0)::int AS seconds_last_30_days,
         COUNT(*) FILTER (
           WHERE status = 'COMPLETED'
             AND started_at >= now() - interval '7 days'
         )::int AS completed_last_7_days,
         COUNT(*) FILTER (
           WHERE status IN ('MISSED', 'FAILED')
             AND started_at >= now() - interval '7 days'
         )::int AS missed_failed_last_7_days
       FROM public.call_logs
       WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId],
    ),
    queryOne<AgentStatsRow>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_agents,
         COUNT(*) FILTER (WHERE status = 'DRAFT')::int AS draft_agents
       FROM public.agents
       WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId],
    ),
  ]);

  return {
    totalCalls: callStats?.total_calls ?? 0,
    callsThisMonth: callStats?.calls_this_month ?? 0,
    callsLastMonth: callStats?.calls_last_month ?? 0,
    activeAgents: agentStats?.active_agents ?? 0,
    draftAgents: agentStats?.draft_agents ?? 0,
    secondsLast30Days: callStats?.seconds_last_30_days ?? 0,
    completedLast7Days: callStats?.completed_last_7_days ?? 0,
    missedFailedLast7Days: callStats?.missed_failed_last_7_days ?? 0,
  };
}

export async function getRecentInboundCalls(
  tenantId: string,
  limit = 10,
): Promise<RecentInboundCallRow[]> {
  const { rows } = await query<RecentCallDbRow>(
    `SELECT c.id, c.caller_number, c.status, c.disposition, c.started_at,
            a.name AS agent_name
     FROM public.call_logs c
     LEFT JOIN public.agents a ON a.id = c.agent_id
     WHERE c.tenant_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.started_at DESC
     LIMIT $2`,
    [tenantId, limit],
  );

  return rows.map((row) => {
    const startedAt =
      typeof row.started_at === "string"
        ? row.started_at
        : row.started_at.toISOString();
    const agentName = row.agent_name ?? null;
    const statusLabel = dispositionLabel(row.status, row.disposition);
    return {
      callId: row.id,
      callerNumber: row.caller_number,
      agentName,
      status: row.status,
      disposition: row.disposition,
      startedAt,
      detail: `${formatPhoneNumberDisplay(row.caller_number)} → ${agentName ?? "Unassigned"}`,
      statusLabel,
      timeUtc: formatUtcTimestamp(startedAt),
    };
  });
}

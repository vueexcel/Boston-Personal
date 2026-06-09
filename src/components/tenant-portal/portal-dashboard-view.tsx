import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Clock,
  Mic2,
  PhoneCall,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatAnswerRate,
  formatDraftAgentsSubtitle,
  formatMinutesUsed,
  formatMonthOverMonthSubtitle,
  type PortalDashboardStats,
  type RecentInboundCallRow,
} from "@/lib/services/portal-dashboard";

type PortalDashboardViewProps = {
  stats: PortalDashboardStats;
  recentCalls: RecentInboundCallRow[];
};

function statusBadgeClass(statusLabel: string): string {
  if (statusLabel === "Missed" || statusLabel === "Failed") {
    return "inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20";
  }
  if (statusLabel === "In progress" || statusLabel === "Initiated") {
    return "inline-flex rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 ring-1 ring-inset ring-blue-600/20";
  }
  return "inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300/60";
}

export function PortalDashboardView({
  stats,
  recentCalls,
}: PortalDashboardViewProps) {
  const metrics = [
    {
      label: "Total calls",
      value: stats.totalCalls.toLocaleString(),
      sub: formatMonthOverMonthSubtitle(
        stats.callsThisMonth,
        stats.callsLastMonth,
      ),
      icon: PhoneCall,
    },
    {
      label: "Active agents",
      value: stats.activeAgents.toLocaleString(),
      sub: formatDraftAgentsSubtitle(stats.draftAgents),
      icon: Mic2,
    },
    {
      label: "Minutes used",
      value: formatMinutesUsed(stats.secondsLast30Days),
      sub: "Rolling 30 days",
      icon: Clock,
    },
    {
      label: "Answer rate",
      value: formatAnswerRate(
        stats.completedLast7Days,
        stats.missedFailedLast7Days,
      ),
      sub: "Last 7 days",
      icon: Activity,
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Dashboard
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 sm:text-base">
          Inbound call performance and recent activity for your voice program.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <Card
              key={m.label}
              className="border-slate-200/90 shadow-sm transition-shadow hover:shadow-md"
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">
                  {m.label}
                </CardTitle>
                <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tracking-tight text-slate-900">
                  {m.value}
                </p>
                <p className="mt-1 text-xs text-slate-500">{m.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-slate-200/90 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-lg text-slate-900">
              Recent inbound calls
            </CardTitle>
            <CardDescription>
              Latest inbound calls handled by your voice agents.
            </CardDescription>
          </div>
          <Link
            href="/portal/call-logs"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-700"
          >
            View all calls
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <div className="overflow-x-auto rounded-lg border border-slate-200/80">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 sm:px-5">Time (UTC)</th>
                  <th className="px-4 py-3 sm:px-5">Type</th>
                  <th className="px-4 py-3 sm:px-5">Detail</th>
                  <th className="px-4 py-3 sm:px-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {recentCalls.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-sm text-slate-600 sm:px-5"
                    >
                      No inbound calls yet. Place a test call to your Twilio
                      number.
                    </td>
                  </tr>
                ) : (
                  recentCalls.map((row) => (
                    <tr
                      key={row.callId}
                      className="text-slate-700 transition-colors hover:bg-slate-50/80"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500 sm:px-5 sm:text-sm">
                        {row.timeUtc}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 sm:px-5">
                        Inbound call
                      </td>
                      <td className="px-4 py-3 text-slate-600 sm:px-5">
                        {row.detail}
                      </td>
                      <td className="px-4 py-3 sm:px-5">
                        <span className={statusBadgeClass(row.statusLabel)}>
                          {row.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

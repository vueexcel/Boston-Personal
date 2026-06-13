"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Building2,
  Clock,
  DollarSign,
  Mic2,
  PhoneCall,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PlatformDashboardData } from "@/lib/services/platform-dashboard";

const CHART_COLORS = ["#4f46e5", "#6366f1", "#818cf8", "#a5b4fc"];
const OUTCOME_COLORS = ["#10b981", "#f59e0b"];

type AdminDashboardViewProps = {
  data: PlatformDashboardData;
};

function formatShortDate(iso: string): string {
  if (iso.length === 7) {
    const [y, m] = iso.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AdminDashboardView({ data }: AdminDashboardViewProps) {
  const { kpis } = data;

type KpiCard = {
  label: string;
  value: string;
  sub: string;
  icon: typeof Building2;
  deferred?: boolean;
};

  const kpiCards: KpiCard[] = [
    {
      label: "Total tenants",
      value: kpis.totalTenants.toLocaleString(),
      sub: `${kpis.activeTenants} active`,
      icon: Building2,
    },
    {
      label: "Active tenants",
      value: kpis.activeTenants.toLocaleString(),
      sub: `${kpis.totalTenants - kpis.activeTenants} non-active`,
      icon: Users,
    },
    {
      label: "New this month",
      value: kpis.newTenantsThisMonth.toLocaleString(),
      sub: "Tenant signups",
      icon: TrendingUp,
    },
    {
      label: "Total calls",
      value: kpis.totalCalls.toLocaleString(),
      sub: `${kpis.callsToday} today`,
      icon: PhoneCall,
    },
    {
      label: "Calls today",
      value: kpis.callsToday.toLocaleString(),
      sub: "Since midnight UTC",
      icon: Activity,
    },
    {
      label: "Minutes consumed",
      value: kpis.minutesConsumed30d.toLocaleString(),
      sub: `${kpis.minutesConsumedAllTime.toLocaleString()} all time`,
      icon: Clock,
    },
    {
      label: "Monthly revenue",
      value: "—",
      sub: "Coming soon",
      icon: DollarSign,
      deferred: true,
    },
    {
      label: "Active agents",
      value: kpis.activeAgents.toLocaleString(),
      sub: "Across all tenants",
      icon: Mic2,
    },
  ];

  const tenantUsageChart = data.tenantUsageDistribution.map((t) => ({
    name:
      t.accountName.length > 18
        ? `${t.accountName.slice(0, 16)}…`
        : t.accountName,
    minutes: t.minutes,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Dashboard
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 sm:text-base">
          Platform-wide metrics across tenants, calls, and voice agents.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((m) => {
          const Icon = m.icon;
          return (
            <Card
              key={m.label}
              className={
                m.deferred
                  ? "border-dashed border-slate-300/90 bg-slate-50/50 shadow-sm"
                  : "border-slate-200/90 shadow-sm transition-shadow hover:shadow-md"
              }
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">
                  {m.label}
                </CardTitle>
                <span
                  className={
                    m.deferred
                      ? "rounded-lg bg-slate-100 p-2 text-slate-400"
                      : "rounded-lg bg-indigo-50 p-2 text-indigo-600"
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-semibold tabular-nums text-slate-900">
                    {m.value}
                  </p>
                  {m.deferred ? (
                    <Badge variant="muted">Coming soon</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">{m.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-200/90 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">New tenant growth</CardTitle>
            <CardDescription>Monthly signups, last 12 months</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.tenantGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  fontSize={12}
                  stroke="#64748b"
                />
                <YAxis allowDecimals={false} fontSize={12} stroke="#64748b" />
                <Tooltip
                  labelFormatter={(label) =>
                    formatShortDate(typeof label === "string" ? label : String(label))
                  }
                  contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0" }}
                />
                <Bar dataKey="value" name="Tenants" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Call volume trend</CardTitle>
            <CardDescription>Daily inbound calls, last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.callVolumeTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  fontSize={12}
                  stroke="#64748b"
                />
                <YAxis allowDecimals={false} fontSize={12} stroke="#64748b" />
                <Tooltip
                  labelFormatter={(label) =>
                    formatShortDate(typeof label === "string" ? label : String(label))
                  }
                  contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0" }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Calls"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Usage trend</CardTitle>
            <CardDescription>Minutes consumed per day, last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.usageTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  fontSize={12}
                  stroke="#64748b"
                />
                <YAxis allowDecimals={false} fontSize={12} stroke="#64748b" />
                <Tooltip
                  labelFormatter={(label) =>
                    formatShortDate(typeof label === "string" ? label : String(label))
                  }
                  contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0" }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Minutes"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Success vs failed calls</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.callOutcomes}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={88}
                  paddingAngle={2}
                >
                  {data.callOutcomes.map((_, i) => (
                    <Cell
                      key={i}
                      fill={OUTCOME_COLORS[i % OUTCOME_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0" }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Tenant-wise usage</CardTitle>
            <CardDescription>
              Top tenants by minutes consumed, last 30 days
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={tenantUsageChart}
                layout="vertical"
                margin={{ left: 8, right: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} fontSize={12} stroke="#64748b" />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  fontSize={12}
                  stroke="#64748b"
                />
                <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0" }} />
                <Bar dataKey="minutes" name="Minutes" radius={[0, 4, 4, 0]}>
                  {tenantUsageChart.map((_, i) => (
                    <Cell
                      key={i}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import {
  Activity,
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

export const metadata: Metadata = {
  title: "Dashboard",
};

const METRICS = [
  {
    label: "Total calls",
    value: "2,847",
    sub: "+12% vs last month",
    icon: PhoneCall,
  },
  {
    label: "Active agents",
    value: "6",
    sub: "2 drafts",
    icon: Mic2,
  },
  {
    label: "Minutes used",
    value: "14,320",
    sub: "Rolling 30 days",
    icon: Clock,
  },
  {
    label: "Answer rate",
    value: "94.2%",
    sub: "Last 7 days",
    icon: Activity,
  },
] as const;

const RECENT_ACTIVITY = [
  {
    time: "2026-05-11 14:22 UTC",
    type: "Inbound call",
    detail: "+1 (617) 555-0198 → Receptionist",
    status: "Completed",
  },
  {
    time: "2026-05-11 13:58 UTC",
    type: "Agent updated",
    detail: "Sales — prompt v3 published",
    status: "Success",
  },
  {
    time: "2026-05-11 12:04 UTC",
    type: "Knowledge",
    detail: "Routing section approved",
    status: "Approved",
  },
  {
    time: "2026-05-11 09:41 UTC",
    type: "Phone number",
    detail: "+1 (857) 555-0142 provisioned",
    status: "Active",
  },
  {
    time: "2026-05-10 22:15 UTC",
    type: "Inbound call",
    detail: "+1 (617) 555-0100 → After hours",
    status: "Missed",
  },
] as const;

/**
 * Tenant dashboard: headline KPIs and recent activity (demo data until APIs are connected).
 */
export default function PortalDashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Dashboard
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 sm:text-base">
          High-level performance for your voice program. Connect live data from
          Bostel APIs when ready.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {METRICS.map((m) => {
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
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Recent activity</CardTitle>
          <CardDescription>
            Latest events across calls, agents, and configuration (sample data).
          </CardDescription>
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
                {RECENT_ACTIVITY.map((row) => (
                  <tr
                    key={row.time + row.detail}
                    className="text-slate-700 transition-colors hover:bg-slate-50/80"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500 sm:px-5 sm:text-sm">
                      {row.time}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 sm:px-5">
                      {row.type}
                    </td>
                    <td className="px-4 py-3 text-slate-600 sm:px-5">
                      {row.detail}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <span
                        className={
                          row.status === "Missed"
                            ? "inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20"
                            : "inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300/60"
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

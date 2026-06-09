import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PortalDashboardView } from "@/components/tenant-portal/portal-dashboard-view";
import { getPortalTenantContext } from "@/lib/auth/portal-context";
import { loginUrl } from "@/lib/auth/routes";
import {
  getPortalDashboardStats,
  getRecentInboundCalls,
} from "@/lib/services/portal-dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function PortalDashboardPage() {
  const ctx = await getPortalTenantContext();
  if (!ctx) {
    redirect(loginUrl({ redirect: "/portal" }));
  }

  const [stats, recentCalls] = await Promise.all([
    getPortalDashboardStats(ctx.tenantId),
    getRecentInboundCalls(ctx.tenantId),
  ]);

  return <PortalDashboardView stats={stats} recentCalls={recentCalls} />;
}

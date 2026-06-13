import type { Metadata } from "next";
import { AdminDashboardView } from "@/components/platform-admin/admin-dashboard-view";
import { getPlatformDashboardData } from "@/lib/services/platform-dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AdminDashboardPage() {
  const data = await getPlatformDashboardData();
  return <AdminDashboardView data={data} />;
}

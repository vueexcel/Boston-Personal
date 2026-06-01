import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CallHistoryClient } from "@/components/tenant-portal/call-history-client";
import { getPortalTenantContext } from "@/lib/auth/portal-context";

export const metadata: Metadata = { title: "Call History" };

export default async function CallLogsPage() {
  const ctx = await getPortalTenantContext();
  if (!ctx) {
    redirect("/login?redirect=/portal/call-logs");
  }
  return <CallHistoryClient tenantId={ctx.tenantId} />;
}

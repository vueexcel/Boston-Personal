import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CallHistoryClient } from "@/components/tenant-portal/call-history-client";
import { getPortalTenantContext } from "@/lib/auth/portal-context";
import { loginUrl } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Call History" };

export default async function CallLogsPage() {
  const ctx = await getPortalTenantContext();
  if (!ctx) {
    redirect(loginUrl({ redirect: "/portal/call-logs" }));
  }
  return <CallHistoryClient tenantId={ctx.tenantId} />;
}

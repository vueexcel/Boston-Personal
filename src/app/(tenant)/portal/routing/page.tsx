import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RoutingFlowBuilder } from "@/components/tenant-portal/routing-flow-builder";
import { getPortalTenantContext } from "@/lib/auth/portal-context";
import { loginUrl } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Routing Flow" };

export default async function RoutingFlowPage() {
  const ctx = await getPortalTenantContext();
  if (!ctx) {
    redirect(loginUrl({ redirect: "/portal/routing" }));
  }
  return <RoutingFlowBuilder tenantId={ctx.tenantId} />;
}

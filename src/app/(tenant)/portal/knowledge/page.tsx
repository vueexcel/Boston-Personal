import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KnowledgeBaseList } from "@/components/tenant-portal/knowledge-base-list";
import { getPortalTenantContext } from "@/lib/auth/portal-context";

export const metadata: Metadata = { title: "Knowledge Base" };

export default async function KnowledgePage() {
  const ctx = await getPortalTenantContext();
  if (!ctx) {
    redirect("/login?redirect=/portal/knowledge");
  }
  return <KnowledgeBaseList tenantId={ctx.tenantId} />;
}

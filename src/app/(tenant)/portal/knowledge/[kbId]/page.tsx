import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { KnowledgeBaseEdit } from "@/components/tenant-portal/knowledge-base-edit";
import { getPortalTenantContext } from "@/lib/auth/portal-context";
import { getKnowledgeBase } from "@/lib/services/knowledge-bases";

type PageProps = {
  params: { kbId: string };
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const ctx = await getPortalTenantContext();
  if (!ctx) return { title: "Knowledge Base" };
  const kb = await getKnowledgeBase(ctx.tenantId, params.kbId);
  if (!kb) return { title: "Knowledge Base" };
  return { title: `${kb.name} · Knowledge Base` };
}

export default async function KnowledgeBaseEditPage({ params }: PageProps) {
  const ctx = await getPortalTenantContext();
  if (!ctx) {
    redirect(`/login?redirect=/portal/knowledge/${params.kbId}`);
  }

  const kb = await getKnowledgeBase(ctx.tenantId, params.kbId);
  if (!kb) {
    notFound();
  }

  return <KnowledgeBaseEdit tenantId={ctx.tenantId} kbId={params.kbId} />;
}

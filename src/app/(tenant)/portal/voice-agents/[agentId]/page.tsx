import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

/** Always load fresh agent row from Supabase (avoid stale RSC payload after PATCH). */
export const dynamic = "force-dynamic";
import { VoiceAgentBuilder } from "@/components/tenant-portal/voice-agent-builder";
import { Button } from "@/components/ui/button";
import { getPortalTenantContext } from "@/lib/auth/portal-context";
import { getAgentForTenant } from "@/lib/services/agents";

type PageProps = {
  params: { agentId: string };
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const ctx = await getPortalTenantContext();
  if (!ctx) return { title: "Agent" };
  const agent = await getAgentForTenant(ctx.tenantId, params.agentId);
  if (!agent) return { title: "Agent" };
  return { title: `${agent.name} · Voice agent` };
}

export default async function VoiceAgentEditPage({ params }: PageProps) {
  const ctx = await getPortalTenantContext();
  if (!ctx) {
    redirect(`/login?redirect=/portal/voice-agents/${params.agentId}`);
  }

  const agent = await getAgentForTenant(ctx.tenantId, params.agentId);
  if (!agent) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Configure agent
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 sm:text-base">
            URL:{" "}
            <span className="font-mono text-xs text-slate-700 sm:text-sm">
              /portal/voice-agents/{agent.id}
            </span>
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/portal/voice-agents">All agents</Link>
        </Button>
      </div>

      <VoiceAgentBuilder tenantId={ctx.tenantId} agent={agent} />
    </div>
  );
}

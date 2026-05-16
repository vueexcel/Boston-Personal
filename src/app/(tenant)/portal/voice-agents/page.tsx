import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VoiceAgentsClient } from "@/components/tenant-portal/voice-agents-client";
import { getPortalTenantContext } from "@/lib/auth/portal-context";

export const metadata: Metadata = { title: "Voice Agents" };

export default async function VoiceAgentsPage() {
  const ctx = await getPortalTenantContext();
  if (!ctx) {
    redirect("/login?redirect=/portal/voice-agents");
  }
  return <VoiceAgentsClient tenantId={ctx.tenantId} />;
}

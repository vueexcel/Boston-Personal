import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VoiceAgentsClient } from "@/components/tenant-portal/voice-agents-client";
import { getPortalTenantContext } from "@/lib/auth/portal-context";
import { loginUrl } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Voice Agents" };

export default async function VoiceAgentsPage() {
  const ctx = await getPortalTenantContext();
  if (!ctx) {
    redirect(loginUrl({ redirect: "/portal/voice-agents" }));
  }
  return <VoiceAgentsClient tenantId={ctx.tenantId} />;
}

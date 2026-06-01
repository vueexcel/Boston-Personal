import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PhoneNumbersClient } from "@/components/tenant-portal/phone-numbers-client";
import { getPortalTenantContext } from "@/lib/auth/portal-context";

export const metadata: Metadata = { title: "Phone Numbers" };

export default async function PhoneNumbersPage() {
  const ctx = await getPortalTenantContext();
  if (!ctx) {
    redirect("/login?redirect=/portal/phone-numbers");
  }
  return <PhoneNumbersClient tenantId={ctx.tenantId} />;
}

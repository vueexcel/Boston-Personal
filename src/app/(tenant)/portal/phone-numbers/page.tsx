import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PhoneNumbersClient } from "@/components/tenant-portal/phone-numbers-client";
import { getPortalTenantContext } from "@/lib/auth/portal-context";
import { loginUrl } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Phone Numbers" };

export default async function PhoneNumbersPage() {
  const ctx = await getPortalTenantContext();
  if (!ctx) {
    redirect(loginUrl({ redirect: "/portal/phone-numbers" }));
  }
  return <PhoneNumbersClient tenantId={ctx.tenantId} />;
}

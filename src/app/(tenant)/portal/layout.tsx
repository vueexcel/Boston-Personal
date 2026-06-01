import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/tenant-portal/portal-shell";
import { getSessionUserFromCookies } from "@/lib/auth/session";
import { getPortalTenantContextForUserId } from "@/lib/auth/portal-context";

export const metadata: Metadata = {
  title: "Portal",
};

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUserFromCookies();
  if (!user) {
    redirect("/login?redirect=/portal");
  }

  const ctx = await getPortalTenantContextForUserId(user.id);
  if (!ctx) {
    redirect("/login?error=no_tenant");
  }

  return (
    <PortalShell
      tenantDisplayId={ctx.tenantDisplayId}
      accountName={ctx.accountName}
      accountStatus={ctx.accountStatus}
    >
      {children}
    </PortalShell>
  );
}

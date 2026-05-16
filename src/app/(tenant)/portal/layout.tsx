import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/tenant-portal/portal-shell";
import { createServerAuthClient } from "@/lib/auth/supabase/server";
import { getPortalTenantContextForUserId } from "@/lib/auth/portal-context";

export const metadata: Metadata = {
  title: "Portal",
};

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = createServerAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
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

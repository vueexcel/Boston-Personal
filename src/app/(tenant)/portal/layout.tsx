import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/tenant-portal/portal-shell";
import { loginUrl } from "@/lib/auth/routes";
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
    redirect(loginUrl({ redirect: "/portal" }));
  }

  const ctx = await getPortalTenantContextForUserId(user.id);
  if (!ctx) {
    redirect(loginUrl({ error: "no_tenant" }));
  }

  return (
    <PortalShell
      accountName={ctx.accountName}
      accountStatus={ctx.accountStatus}
    >
      {children}
    </PortalShell>
  );
}

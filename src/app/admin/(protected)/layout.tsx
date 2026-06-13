import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AdminShell } from "@/components/platform-admin/admin-shell";
import { requirePlatformAdmin } from "@/lib/auth/platform-access";

export const metadata: Metadata = {
  title: "Admin",
};

export default async function AdminProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requirePlatformAdmin();

  return <AdminShell adminEmail={user.email}>{children}</AdminShell>;
}

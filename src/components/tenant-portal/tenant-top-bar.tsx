import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { TenantPortalAccountStatus } from "@/lib/tenant-portal/demo-context";

type TenantTopBarProps = {
  accountName: string;
  accountStatus: TenantPortalAccountStatus;
  /** Mobile menu control rendered by the shell. */
  mobileMenuTrigger?: ReactNode;
};

/**
 * Sticky top bar with organization name and account status.
 */
export function TenantTopBar({
  accountName,
  accountStatus,
  mobileMenuTrigger,
}: TenantTopBarProps) {
  const isActive = accountStatus === "ACTIVE";

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200/90 bg-white/90 px-4 backdrop-blur-md sm:px-6 lg:px-8 supports-[backdrop-filter]:bg-white/75">
      <div className="flex min-w-0 items-center gap-3">
        {mobileMenuTrigger}
        <p className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
          {accountName}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="hidden text-sm text-slate-500 sm:inline">Status</span>
        <Badge variant={isActive ? "success" : "muted"} className="font-medium">
          {isActive ? "Active" : "Inactive"}
        </Badge>
      </div>
    </header>
  );
}

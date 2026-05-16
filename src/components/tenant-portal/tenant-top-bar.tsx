import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { TenantPortalAccountStatus } from "@/lib/tenant-portal/demo-context";

type TenantTopBarProps = {
  tenantDisplayId: string;
  accountName?: string;
  accountStatus: TenantPortalAccountStatus;
  /** Mobile menu control rendered by the shell. */
  mobileMenuTrigger?: ReactNode;
};

/**
 * Sticky top bar with tenant identity and account status for enterprise context.
 */
export function TenantTopBar({
  tenantDisplayId,
  accountName,
  accountStatus,
  mobileMenuTrigger,
}: TenantTopBarProps) {
  const isActive = accountStatus === "ACTIVE";

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200/90 bg-white/90 px-4 backdrop-blur-md sm:px-6 lg:px-8 supports-[backdrop-filter]:bg-white/75">
      <div className="flex items-center gap-3 min-w-0">
        {mobileMenuTrigger}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Tenant
          </p>
          <p className="truncate font-mono text-sm font-semibold text-slate-900 sm:text-base">
            {tenantDisplayId}
          </p>
          {accountName ? (
            <p className="truncate text-xs text-slate-600 sm:text-sm">
              {accountName}
            </p>
          ) : null}
        </div>
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

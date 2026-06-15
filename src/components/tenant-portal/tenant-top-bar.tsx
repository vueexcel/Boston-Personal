"use client";

import type { ReactNode } from "react";
import { Compass } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePortalTour } from "@/hooks/use-portal-tour";
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
  const { startTour, isTourActive } = usePortalTour();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200/90 bg-white/90 px-4 backdrop-blur-md sm:px-6 lg:px-8 supports-[backdrop-filter]:bg-white/75">
      <div className="flex min-w-0 items-center gap-3">
        {mobileMenuTrigger}
        <p className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
          {accountName}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-tour="take-tour"
          className="text-slate-600 hover:text-indigo-700"
          disabled={isTourActive}
          onClick={startTour}
        >
          <Compass className="mr-1.5 h-4 w-4" aria-hidden />
          Take tour
        </Button>
        <div
          data-tour="top-bar-status"
          className="flex items-center gap-2"
        >
          <span className="hidden text-sm text-slate-500 sm:inline">Status</span>
          <Badge variant={isActive ? "success" : "muted"} className="font-medium">
            {isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>
    </header>
  );
}

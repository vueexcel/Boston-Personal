"use client";

import * as React from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TenantSidebar } from "@/components/tenant-portal/tenant-sidebar";
import { TenantTopBar } from "@/components/tenant-portal/tenant-top-bar";
import { PortalTourProvider } from "@/components/tenant-portal/portal-tour-provider";
import type { TenantPortalAccountStatus } from "@/lib/tenant-portal/demo-context";
import { cn } from "@/lib/utils";

type PortalShellProps = {
  children: React.ReactNode;
  accountName: string;
  accountStatus: TenantPortalAccountStatus;
};

/**
 * Responsive portal chrome: collapsible sidebar on small screens, persistent on `md+`.
 */
export function PortalShell({
  children,
  accountName,
  accountStatus,
}: PortalShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    const onResize = () => {
      if (window.matchMedia("(min-width: 768px)").matches) {
        setMobileOpen(false);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  React.useEffect(() => {
    const html = document.documentElement;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  return (
    <PortalTourProvider openMobileNav={() => setMobileOpen(true)}>
      <div
        data-portal-shell
        className="fixed inset-0 flex overflow-hidden bg-slate-50/90"
      >
      {/* Desktop sidebar — full viewport height; nav scrolls inside if needed */}
      <aside
        data-portal-desktop-sidebar
        className="hidden h-full w-64 shrink-0 border-r border-slate-200/90 bg-white shadow-sm md:flex md:flex-col"
      >
        <TenantSidebar />
      </aside>

      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!mobileOpen}
        onClick={() => setMobileOpen(false)}
      />

      {/* Mobile drawer */}
      <div
        data-portal-mobile-drawer
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(18rem,100vw-2rem)] flex-col border-r border-slate-200/90 bg-white shadow-2xl transition-transform duration-200 ease-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex shrink-0 justify-end border-b border-slate-100 p-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-slate-500"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <TenantSidebar
          className="min-h-0 flex-1"
          onNavigate={() => setMobileOpen(false)}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TenantTopBar
          accountName={accountName}
          accountStatus={accountStatus}
          mobileMenuTrigger={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-slate-600 md:hidden -ml-1"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          }
        />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
    </PortalTourProvider>
  );
}

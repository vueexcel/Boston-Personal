"use client";

import * as React from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminSidebar } from "@/components/platform-admin/admin-sidebar";
import { cn } from "@/lib/utils";

type AdminShellProps = {
  children: React.ReactNode;
  adminEmail: string;
};

export function AdminShell({ children, adminEmail }: AdminShellProps) {
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

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-slate-50/90">
      <aside className="hidden h-full w-64 shrink-0 border-r border-slate-200/90 bg-white shadow-sm md:flex md:flex-col">
        <AdminSidebar adminEmail={adminEmail} />
      </aside>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!mobileOpen}
        onClick={() => setMobileOpen(false)}
      />

      <div
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
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <AdminSidebar
          adminEmail={adminEmail}
          onNavigate={() => setMobileOpen(false)}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200/90 bg-white px-4 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold text-slate-900">
            Platform admin
          </span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

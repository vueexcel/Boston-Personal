"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BostelLogo } from "@/components/brand/bostel-logo";
import { cn } from "@/lib/utils";
import { PORTAL_NAV_ITEMS } from "@/components/tenant-portal/portal-nav";

type TenantSidebarProps = {
  onNavigate?: () => void;
  className?: string;
};

/**
 * Primary sidebar navigation for the Customer Tenant Portal (desktop + mobile drawer body).
 */
export function TenantSidebar({ onNavigate, className }: TenantSidebarProps) {
  const pathname = usePathname();

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex h-16 shrink-0 items-center border-b border-slate-200/90 px-6">
        <Link
          href="/portal"
          prefetch={false}
          className="flex items-center gap-2.5 font-semibold tracking-tight text-slate-900"
          onClick={onNavigate}
        >
          <BostelLogo size="sm" framed />
        </Link>
      </div>
      <nav
        className="flex-1 space-y-0.5 overflow-y-auto p-3"
        aria-label="Main"
        data-tour="sidebar-nav"
      >
        {PORTAL_NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/portal" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900",
                active &&
                  "border-l-[3px] border-indigo-600 bg-indigo-50/90 pl-[calc(0.75rem-3px)] text-indigo-800 hover:bg-indigo-50 hover:text-indigo-900",
                !active && "border-l-[3px] border-transparent",
              )}
            >
              <Icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0",
                  active ? "text-indigo-600" : "text-slate-400",
                )}
                aria-hidden
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="shrink-0 border-t border-slate-200/90 p-4 space-y-3">
        <a
          href="/auth/sign-out"
          className="flex w-full items-center justify-center rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          Sign out
        </a>
        <p className="text-xs leading-relaxed text-slate-500">
          Customer Tenant Portal
        </p>
      </div>
    </div>
  );
}

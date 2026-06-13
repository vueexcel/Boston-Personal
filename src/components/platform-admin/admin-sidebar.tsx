"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  DollarSign,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
import { BostelLogo } from "@/components/brand/bostel-logo";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/tenants", label: "Tenants", icon: Building2 },
  { href: "/admin/pricing", label: "Pricing", icon: DollarSign },
] as const;

type AdminSidebarProps = {
  onNavigate?: () => void;
  className?: string;
  adminEmail?: string;
};

export function AdminSidebar({
  onNavigate,
  className,
  adminEmail,
}: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex h-16 shrink-0 items-center border-b border-slate-200/90 px-6">
        <Link
          href="/admin"
          className="flex items-center gap-2.5 font-semibold tracking-tight text-slate-900"
          onClick={onNavigate}
        >
          <BostelLogo size="sm" framed />
        </Link>
      </div>
      <div className="px-6 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Platform admin
        </p>
        {adminEmail ? (
          <p className="mt-1 truncate text-xs text-slate-600">{adminEmail}</p>
        ) : null}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Admin">
        {ADMIN_NAV.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
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
                  "h-4 w-4 shrink-0",
                  active ? "text-indigo-600" : "text-slate-400",
                )}
                aria-hidden
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="shrink-0 border-t border-slate-200/90 p-3">
        <Link
          href="/auth/sign-out"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <LogOut className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          Sign out
        </Link>
      </div>
    </div>
  );
}

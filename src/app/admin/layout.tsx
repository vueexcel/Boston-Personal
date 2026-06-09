import type { ReactNode } from "react";
import Link from "next/link";
import { BostelLogo } from "@/components/brand/bostel-logo";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin/tenants" className="shrink-0">
              <BostelLogo size="sm" framed />
            </Link>
            <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
            <span className="font-semibold text-foreground">Platform admin</span>
            <Link
              href="/admin/tenants"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Tenants
            </Link>
          </nav>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Home
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8">{children}</div>
    </div>
  );
}

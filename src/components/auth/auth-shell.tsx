import type { ReactNode } from "react";
import { Phone, Sparkles, Zap } from "lucide-react";
import { BostelLogo } from "@/components/brand/bostel-logo";

type AuthShellProps = {
  children: ReactNode;
  title: string;
  subtitle: string;
};

const FEATURES = [
  {
    icon: Phone,
    label: "Intelligent call routing",
    detail: "Route every inbound call to the right AI agent instantly.",
  },
  {
    icon: Sparkles,
    label: "Natural voice conversations",
    detail: "Premium voices and real-time understanding at scale.",
  },
  {
    icon: Zap,
    label: "Enterprise-ready",
    detail: "Tenant-isolated workspaces built for growing teams.",
  },
] as const;

export function AuthShell({ children, title, subtitle }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel */}
      <div className="auth-brand-panel relative flex flex-col justify-between overflow-hidden px-8 py-10 lg:w-[44%] lg:px-12 lg:py-12 xl:px-16">
        <div className="relative z-10">
          <BostelLogo size="lg" priority />
        </div>

        <div className="relative z-10 mt-10 space-y-8 lg:mt-0">
          <div className="space-y-3">
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-white xl:text-4xl">
              Voice AI that feels human.
            </h1>
            <p className="max-w-md text-pretty text-sm leading-relaxed text-white/70 lg:text-base">
              Deploy intelligent voice agents, manage knowledge bases, and
              handle every call — from one refined workspace.
            </p>
          </div>

          <ul className="hidden space-y-4 lg:block" aria-label="Platform highlights">
            {FEATURES.map(({ icon: Icon, label, detail }) => (
              <li key={label} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/10">
                  <Icon className="h-4 w-4 text-white/90" aria-hidden />
                </span>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-white/95">{label}</p>
                  <p className="text-sm leading-relaxed text-white/55">
                    {detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 mt-10 hidden text-xs text-white/40 lg:block">
          © {new Date().getFullYear()} Bostel Voice AI
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="mb-8 space-y-2 text-center lg:text-left">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

function LoginFormFallback() {
  return (
    <div
      className="flex h-64 items-center justify-center rounded-xl border border-border/60 bg-card/50"
      aria-busy="true"
      aria-label="Loading sign in form"
    >
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export default function HomePage() {
  return (
    <AuthShell
      title="Sign in to your workspace"
      subtitle="Use the email and password for your Bostel Voice AI account."
    >
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm allowedRedirectPrefixes={["/portal"]} />
      </Suspense>
    </AuthShell>
  );
}

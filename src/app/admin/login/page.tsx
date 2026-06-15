import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Admin sign in",
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

export default function AdminLoginPage() {
  return (
    <AuthShell
      title="Platform administration"
      subtitle="Sign in with your platform admin credentials."
    >
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm
          defaultRedirect="/admin"
          allowedRedirectPrefixes={["/admin"]}
          showSignupLink={false}
          title="Admin access"
          description="Use the credentials provisioned for platform administration."
        />
      </Suspense>
    </AuthShell>
  );
}

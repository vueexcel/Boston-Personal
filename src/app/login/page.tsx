import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50/90 px-4 py-12">
      <Link
        href="/"
        className="text-sm text-slate-600 transition-colors hover:text-slate-900"
      >
        ← Home
      </Link>
      <Suspense
        fallback={<p className="text-sm text-slate-600">Loading form…</p>}
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}

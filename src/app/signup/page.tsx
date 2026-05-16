import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50/90 px-4 py-12">
      <Link
        href="/"
        className="text-sm text-slate-600 transition-colors hover:text-slate-900"
      >
        ← Home
      </Link>
      <SignupForm />
    </main>
  );
}

import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Sign up",
};

export default function SignupPage() {
  return (
    <AuthShell
      title="Start your free workspace"
      subtitle="Create an organization and deploy your first voice agent in minutes."
    >
      <SignupForm />
    </AuthShell>
  );
}

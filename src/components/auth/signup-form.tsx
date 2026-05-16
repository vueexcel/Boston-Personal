"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabase } from "@/lib/auth/supabase/client";

export function SignupForm() {
  const router = useRouter();
  const [accountName, setAccountName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const supabase = createBrowserSupabase();
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
      const { data, error: signErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${appUrl}/auth/callback?next=/portal`,
          data: {
            account_name: accountName.trim() || undefined,
          },
        },
      });
      if (signErr) {
        setError(signErr.message);
        setSubmitting(false);
        return;
      }
      if (data.session) {
        router.push("/portal");
        router.refresh();
        return;
      }
      setInfo(
        "Check your email to confirm your address, then sign in. After confirmation you will have a new workspace.",
      );
      setSubmitting(false);
    } catch {
      setError("Something went wrong.");
      setSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-slate-200 shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-semibold tracking-tight">
          Create your workspace
        </CardTitle>
        <CardDescription>
          We will create an organization for you and link it to this account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div className="space-y-2">
            <Label htmlFor="signup-org">Organization name</Label>
            <Input
              id="signup-org"
              type="text"
              autoComplete="organization"
              placeholder="e.g. Acme Plumbing"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="border-slate-200"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-email">Work email</Label>
            <Input
              id="signup-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-slate-200"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-password">Password</Label>
            <Input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-slate-200"
            />
            <p className="text-xs text-slate-500">At least 8 characters.</p>
          </div>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="text-sm text-slate-700" role="status">
              {info}
            </p>
          ) : null}
          <Button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700"
            disabled={submitting}
          >
            {submitting ? "Creating account…" : "Sign up"}
          </Button>
          <p className="text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-indigo-600 hover:text-indigo-700"
            >
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

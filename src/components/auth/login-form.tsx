"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
type LoginFormProps = {
  defaultRedirect?: string;
  /** When set, overrides API redirect after login. */
  forceRedirect?: string;
  showSignupLink?: boolean;
  title?: string;
  description?: string;
};

export function LoginForm({
  defaultRedirect = "/portal",
  forceRedirect,
  showSignupLink = true,
  title = "Welcome back",
  description = "Enter your credentials to access your workspace.",
}: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? defaultRedirect;
  const paramError = searchParams.get("error");

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(
    paramError === "no_tenant"
      ? "Your account is not linked to an organization yet. Try signing up again or contact support."
      : paramError === "auth_callback"
        ? "Sign-in link expired or is invalid. Try again."
        : null,
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Sign in failed");
        setSubmitting(false);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        redirectTo?: string;
      };
      const destination =
        forceRedirect ??
        body.redirectTo ??
        (redirectTo.startsWith("/") ? redirectTo : defaultRedirect);
      router.push(destination);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-border/60 bg-card/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-sm">
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="text-xl font-semibold tracking-tight">
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={(e) => void onSubmit(e)}>
          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 bg-background/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 bg-background/50"
            />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className="h-10 w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
          {showSignupLink ? (
            <p className="text-center text-sm text-muted-foreground">
              No account?{" "}
              <Link
                href="/signup"
                className="font-medium text-primary underline-offset-4 transition-colors hover:underline"
              >
                Create one
              </Link>
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

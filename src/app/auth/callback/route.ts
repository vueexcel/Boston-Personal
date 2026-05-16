import { createServerAuthClient } from "@/lib/auth/supabase/server";
import { NextResponse } from "next/server";

/**
 * OAuth / magic-link code exchange (PKCE). Email confirmation redirects here when configured in Supabase.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next =
    requestUrl.searchParams.get("next") ??
    requestUrl.searchParams.get("redirect_to") ??
    "/portal";

  if (code) {
    const supabase = createServerAuthClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=auth_callback", requestUrl.origin),
  );
}

import { NextResponse } from "next/server";
import { loginUrl } from "@/lib/auth/routes";

/**
 * Legacy Supabase email-confirm callback — redirect to login.
 */
export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  return NextResponse.redirect(
    new URL(loginUrl({ error: "auth_callback" }), requestUrl.origin),
  );
}

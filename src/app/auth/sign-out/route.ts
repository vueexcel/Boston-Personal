import { createServerAuthClient } from "@/lib/auth/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = createServerAuthClient();
  await supabase.auth.signOut();
  const url = new URL("/", new URL(request.url).origin);
  return NextResponse.redirect(url);
}

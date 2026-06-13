import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/auth/platform-access";
import { getSessionUserFromCookies } from "@/lib/auth/session";

export async function GET(): Promise<Response> {
  const user = await getSessionUserFromCookies();
  if (!user) {
    redirect("/");
  }
  if (isPlatformAdmin(user)) {
    redirect("/admin");
  }
  redirect("/portal");
  return NextResponse.json({ ok: true });
}

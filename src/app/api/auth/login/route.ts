import { NextResponse } from "next/server";
import { z } from "zod";
import { signInWithPassword } from "@/lib/auth/credentials";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await signInWithPassword(parsed.data);
  if (!result) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const redirectTo =
    result.user.role === "PLATFORM_ADMIN" ? "/admin" : "/portal";
  const res = NextResponse.json({ ok: true, redirectTo });
  res.cookies.set(
    SESSION_COOKIE,
    result.sessionToken,
    sessionCookieOptions(expires),
  );
  return res;
}

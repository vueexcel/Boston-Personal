import { NextResponse } from "next/server";
import { z } from "zod";
import { signUpWithPassword } from "@/lib/auth/credentials";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  accountName: z.string().min(1).max(200),
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
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { sessionToken } = await signUpWithPassword(parsed.data);
    const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(expires));
    return res;
  } catch (e) {
    const code = e instanceof Error ? (e as Error & { code?: string }).code : undefined;
    if (code === "EMAIL_IN_USE") {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }
    console.error("[auth/signup]", e);
    return NextResponse.json({ error: "Sign up failed" }, { status: 500 });
  }
}

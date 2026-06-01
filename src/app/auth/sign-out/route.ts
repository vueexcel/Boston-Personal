import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  deleteSessionByToken,
  SESSION_COOKIE,
} from "@/lib/auth/session";

export async function POST(request: Request): Promise<Response> {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await deleteSessionByToken(token);
  }
  const res = NextResponse.redirect(new URL("/login", request.url));
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}

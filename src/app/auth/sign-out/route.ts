import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  deleteSessionByToken,
  SESSION_COOKIE,
} from "@/lib/auth/session";
import { LOGIN_PATH } from "@/lib/auth/routes";

async function signOutAndRedirect(request: Request): Promise<Response> {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await deleteSessionByToken(token);
  }
  const res = NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}

/** Sidebar and direct navigation use GET. */
export async function GET(request: Request): Promise<Response> {
  return signOutAndRedirect(request);
}

export async function POST(request: Request): Promise<Response> {
  return signOutAndRedirect(request);
}

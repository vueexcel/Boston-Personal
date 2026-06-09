import { NextResponse, type NextRequest } from "next/server";
import { getPublicOrigin } from "@/lib/auth/public-origin";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { SESSION_COOKIE } from "@/lib/auth/session-constants";

/** Cookie presence only — full session validation runs in server layouts/API. */
function hasSessionCookie(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return Boolean(token && token.length >= 16);
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const pathname = request.nextUrl.pathname;
  const loggedIn = hasSessionCookie(request);
  const origin = getPublicOrigin({
    headers: request.headers,
    fallbackHost: request.nextUrl.host,
    fallbackProto: request.nextUrl.protocol.replace(/:$/, ""),
  });

  if (pathname.startsWith("/portal") && !loggedIn) {
    const redirectUrl = new URL(LOGIN_PATH, origin);
    redirectUrl.searchParams.set(
      "redirect",
      `${pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(redirectUrl);
  }

  const authEntryPaths = new Set([LOGIN_PATH, "/login", "/signup"]);
  if (authEntryPaths.has(pathname) && loggedIn) {
    return NextResponse.redirect(new URL("/portal", origin));
  }

  return response;
}

export const config = {
  matcher: ["/portal/:path*", "/", "/login", "/signup"],
};

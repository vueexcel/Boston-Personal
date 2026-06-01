import { NextResponse, type NextRequest } from "next/server";
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

  if (pathname.startsWith("/portal") && !loggedIn) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set(
      "redirect",
      `${pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(redirectUrl);
  }

  if ((pathname === "/login" || pathname === "/signup") && loggedIn) {
    return NextResponse.redirect(new URL("/portal", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/portal/:path*", "/login", "/signup"],
};

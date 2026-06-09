import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session-constants";
import { LOGIN_PATH } from "@/lib/auth/routes";

/** Public origin for redirects behind Caddy + server.prod internal proxy. */
function getPublicOrigin(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(/:$/, "");
  return `${proto}://${host}`;
}

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
  const origin = getPublicOrigin(request);

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

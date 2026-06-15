/** Canonical sign-in URL (root). Legacy `/login` redirects here. */
export const LOGIN_PATH = "/";

export const ADMIN_LOGIN_PATH = "/admin/login";

export function adminLoginUrl(
  params?: Record<string, string | undefined>,
): string {
  if (!params) return ADMIN_LOGIN_PATH;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${ADMIN_LOGIN_PATH}?${qs}` : ADMIN_LOGIN_PATH;
}

export function loginUrl(params?: Record<string, string | undefined>): string {
  if (!params) return LOGIN_PATH;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${LOGIN_PATH}?${qs}` : LOGIN_PATH;
}

/** Reject open redirects; only allow same-origin relative paths under known prefixes. */
export function parseSafeRedirectPath(
  value: string | null | undefined,
  allowedPrefixes: readonly string[],
): string | null {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  const pathname = value.split(/[?#]/)[0] ?? value;
  const allowed = allowedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return allowed ? value : null;
}

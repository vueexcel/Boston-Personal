/** Public origin for redirects behind Caddy + server.prod internal proxy. */
export function getPublicOrigin(input: {
  headers: { get(name: string): string | null };
  fallbackHost: string;
  fallbackProto: string;
}): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const host =
    input.headers.get("x-forwarded-host") ??
    input.headers.get("host") ??
    input.fallbackHost;
  const proto =
    input.headers.get("x-forwarded-proto") ?? input.fallbackProto;
  return `${proto}://${host}`;
}

export function getPublicOriginFromRequest(request: Request): string {
  const url = new URL(request.url);
  return getPublicOrigin({
    headers: request.headers,
    fallbackHost: url.host,
    fallbackProto: url.protocol.replace(/:$/, ""),
  });
}

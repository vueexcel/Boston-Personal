/**
 * Reconstructs the public URL from the incoming request (proxy-aware).
 */
export function getTwilioWebhookPublicUrl(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = request.headers.get("host");
  const proto =
    forwardedProto ?? url.protocol.replace(/:$/, "") ?? "https";
  const h = forwardedHost ?? host ?? url.host;
  return `${proto}://${h}${url.pathname}${url.search}`;
}

/**
 * Canonical base URL for Twilio webhook signing (no trailing slash).
 * Prefer TWILIO_WEBHOOK_BASE_URL, then NEXT_PUBLIC_APP_URL.
 */
export function getTwilioWebhookBaseUrl(): string | null {
  const explicit = process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(
    /\/$/,
    "",
  );
  if (explicit) return explicit;

  const app = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  return app || null;
}

/**
 * URL Twilio used when signing the webhook. Must match the Voice URL configured
 * in Twilio Console exactly (scheme, host, path, query).
 *
 * Uses canonical base from env when set; otherwise falls back to request headers.
 */
export function getTwilioSignatureUrl(request: Request): string {
  const base = getTwilioWebhookBaseUrl();
  if (base) {
    const url = new URL(request.url);
    return `${base}${url.pathname}${url.search}`;
  }
  return getTwilioWebhookPublicUrl(request);
}

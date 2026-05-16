/**
 * Reconstructs the public URL Twilio used when signing the webhook (must match validation input).
 * Prefer proxy headers (`x-forwarded-*`) when the app sits behind TLS termination.
 *
 * @param request - Incoming `Request` from the route handler.
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

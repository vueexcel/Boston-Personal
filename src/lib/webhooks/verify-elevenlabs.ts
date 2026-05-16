import { Webhook } from "standardwebhooks";

/**
 * Verifies Standard Webhooks signatures (used by several AI/voice vendors including ElevenLabs-style payloads).
 * Configure `ELEVENLABS_WEBHOOK_SECRET` with the raw signing secret from the vendor console.
 *
 * @param rawBody - Raw request body string (must not be re-serialized JSON).
 * @param headers - Incoming webhook headers carrying `webhook-id`, `webhook-timestamp`, and `webhook-signature`.
 */
export function verifyElevenLabsStyleWebhook(
  rawBody: string,
  headers: Headers,
): boolean {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) {
    return false;
  }
  const wh = new Webhook(secret);
  const bundle = {
    "webhook-id": headers.get("webhook-id") ?? "",
    "webhook-timestamp": headers.get("webhook-timestamp") ?? "",
    "webhook-signature": headers.get("webhook-signature") ?? "",
  };
  try {
    wh.verify(rawBody, bundle);
    return true;
  } catch {
    return false;
  }
}

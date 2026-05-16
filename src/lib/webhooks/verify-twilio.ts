import twilio from "twilio";

/**
 * Converts `application/x-www-form-urlencoded` Twilio webhook fields to the flat string map
 * required by Twilio request validation.
 *
 * @param form - Parsed `FormData` from the incoming webhook request.
 */
export function twilioFormDataToParams(form: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Array.from(form.entries())) {
    if (typeof value === "string") {
      params[key] = value;
    }
  }
  return params;
}

/**
 * Verifies the `X-Twilio-Signature` header for a voice webhook before processing body.
 * Uses `TWILIO_AUTH_TOKEN` from the environment (per-account tokens should be resolved similarly).
 *
 * @param requestUrl - Full public URL Twilio posted to (must match Twilio's signing input).
 * @param signature - Value of the `X-Twilio-Signature` header.
 * @param params - Flattened POST parameters from {@link twilioFormDataToParams}.
 * @returns True when the signature is authentic.
 */
export function verifyTwilioWebhookSignature(
  requestUrl: string,
  signature: string | null,
  params: Record<string, string>,
): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) {
    return false;
  }
  return twilio.validateRequest(token, signature, requestUrl, params);
}

import { getServerEnv } from "@/lib/env/server";
import type { RoutingFallbackConfig } from "@/lib/tenant-portal/routing-settings-v1";
import { spokenMessageTwiML } from "@/lib/voice/twiml-stream";
import { getTwilioRecordingWebhookUrl } from "@/lib/webhooks/twilio-app-url";

/**
 * Escapes text for safe inclusion inside Twilio TwiML `<Say>` elements.
 *
 * @param text - Raw user- or system-generated phrase.
 */
export function escapeForTwiMLSay(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TWIML_MESSAGE_MAX = 500;

function truncateForTwiML(message: string): string {
  return message.trim().slice(0, TWIML_MESSAGE_MAX);
}

/**
 * TwiML returned when a tenant is **inactive** or cannot be routed to live agents.
 * Inactive tenants must always receive fallback — never live agent handoff.
 *
 * @param message - Optional override spoken to the caller.
 */
export function inactiveTenantTwiML(message?: string): string {
  const phrase = escapeForTwiMLSay(
    truncateForTwiML(
      message ??
        "This line is not accepting calls right now. Please try again later.",
    ),
  );
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${phrase}</Say><Hangup/></Response>`;
}

/**
 * TwiML stub for an **active** tenant on the happy path (replace with `<Dial>` / media streams).
 *
 * @param tenantId - Tenant receiving the call (for logging / future routing).
 */
export function activeTenantStubTwiML(tenantId: string): string {
  const safe = escapeForTwiMLSay(`Tenant ${tenantId} is active. Connecting.`);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${safe}</Say><Pause length="1"/><Hangup/></Response>`;
}

export function getBostelSupportE164(): string | null {
  const raw = getServerEnv().BOSTEL_SUPPORT_E164?.trim() ?? "";
  return raw || null;
}

function dialNumberTwiML(e164: string): string {
  const safe = escapeXmlAttr(e164);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeout="30">${safe}</Dial><Hangup/></Response>`;
}

function voicemailTwiML(script: string): string {
  const phrase = escapeForTwiMLSay(truncateForTwiML(script));
  const recordingUrl = escapeXmlAttr(getTwilioRecordingWebhookUrl());
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${phrase}</Say><Record maxLength="120" playBeep="true" recordingStatusCallback="${recordingUrl}" recordingStatusCallbackMethod="POST"/><Hangup/></Response>`;
}

/**
 * Builds TwiML for tenant-configured routing fallbacks (after-hours, inactive account).
 */
export function buildRoutingFallbackTwiML(
  fallback: RoutingFallbackConfig,
): string {
  switch (fallback.type) {
    case "MESSAGE":
      return spokenMessageTwiML(
        truncateForTwiML(
          fallback.message ??
            "This line is not accepting calls right now. Please try again later.",
        ),
      );
    case "PHONE_FORWARD": {
      const forwardTo = fallback.forwardTo?.trim();
      if (!forwardTo) {
        return spokenMessageTwiML(
          "We could not complete your call. Please try again later.",
        );
      }
      return dialNumberTwiML(forwardTo);
    }
    case "BOSTEL_SUPPORT": {
      const support = getBostelSupportE164();
      if (support) {
        return dialNumberTwiML(support);
      }
      console.warn(
        "[bostel-voice] BOSTEL_SUPPORT_E164 is not configured; using message fallback",
      );
      return spokenMessageTwiML(
        truncateForTwiML(
          fallback.message ??
            "Please contact Bostel support during business hours.",
        ),
      );
    }
    case "VOICEMAIL":
      return voicemailTwiML(
        fallback.message ??
          "Please leave a message after the tone with your name and callback number.",
      );
  }
}

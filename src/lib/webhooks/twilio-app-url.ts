import { getTwilioWebhookBaseUrl } from "@/lib/webhooks/request-url";

/**
 * Public app base URL for Twilio voice webhook configuration (no trailing slash).
 */
export function getAppPublicBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!base) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured");
  }
  return base;
}

/** Canonical HTTPS base for Twilio callbacks (must match signature validation). */
export function getTwilioPublicWebhookBase(): string {
  return getTwilioWebhookBaseUrl() ?? getAppPublicBaseUrl();
}

export function getTwilioVoiceWebhookUrl(): string {
  return `${getTwilioPublicWebhookBase()}/api/webhooks/twilio/voice`;
}

export function getTwilioVoiceStatusWebhookUrl(): string {
  return `${getTwilioPublicWebhookBase()}/api/webhooks/twilio/voice/status`;
}

export function getTwilioRecordingWebhookUrl(): string {
  return `${getTwilioPublicWebhookBase()}/api/webhooks/twilio/voice/recording`;
}

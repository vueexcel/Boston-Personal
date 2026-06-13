import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  /** PostgreSQL connection string (AWS RDS or local). Required in production. */
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_SSL: z.enum(["0", "1", "true", "false"]).optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().optional(),
  REDIS_URL: z.string().min(1).optional(),
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  /** Canonical HTTPS base for Twilio webhook signature validation (no trailing slash). */
  TWILIO_WEBHOOK_BASE_URL: z.string().url().optional(),
  /** Full WSS URL for Twilio Media Streams, e.g. wss://app.example.com/twilio/media-stream */
  TWILIO_MEDIA_STREAM_WSS_URL: z.string().url().optional(),
  /** Local media stream worker HTTP port (WebSocket upgrade). */
  VOICE_MEDIA_STREAM_PORT: z.coerce.number().int().positive().optional(),
  /** Path segment for media stream WebSocket (default /twilio/media-stream). */
  TWILIO_MEDIA_STREAM_PATH: z.string().min(1).optional(),
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  /** Default model for call summaries and auxiliary LLM tasks. */
  OPENAI_MODEL: z.string().min(1).optional(),
  /** ElevenLabs Scribe v2 Realtime model for PSTN STT. */
  ELEVENLABS_STT_MODEL: z.string().min(1).optional(),
  /** Audio format for Scribe (default ulaw_8000 for Twilio Media Streams). */
  ELEVENLABS_STT_AUDIO_FORMAT: z.string().min(1).optional(),
  PORTAL_TENANT_DISPLAY_ID: z.string().min(1).optional(),
  PORTAL_ACCOUNT_STATUS: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  /** E.164 for BOSTEL_SUPPORT routing fallback (optional). */
  BOSTEL_SUPPORT_E164: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Parses and caches validated server-side environment variables (never exposed to the client).
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  cached = serverEnvSchema.parse(process.env);
  return cached;
}

export function getTwilioMediaStreamWssUrl(): string {
  if (process.env.VOICE_MEDIA_STREAM_PROXY_VIA_APP === "1") {
    const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
    if (!base) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL is required when VOICE_MEDIA_STREAM_PROXY_VIA_APP=1",
      );
    }
    const wssBase = base.replace(/^https:\/\//i, "wss://").replace(/^http:\/\//i, "wss://");
    return `${wssBase}${getVoiceMediaStreamPath()}`;
  }

  const env = getServerEnv();
  const url = env.TWILIO_MEDIA_STREAM_WSS_URL?.trim();
  if (!url) {
    throw new Error("TWILIO_MEDIA_STREAM_WSS_URL is not configured");
  }
  return url;
}

export function getVoiceMediaStreamPort(): number {
  const env = getServerEnv();
  return env.VOICE_MEDIA_STREAM_PORT ?? 3001;
}

export function getVoiceMediaStreamPath(): string {
  const env = getServerEnv();
  const path = env.TWILIO_MEDIA_STREAM_PATH?.trim() || "/twilio/media-stream";
  return path.startsWith("/") ? path : `/${path}`;
}

export function getVoiceTestStreamPath(): string {
  const path =
    process.env.VOICE_TEST_STREAM_PATH?.trim() || "/voice/agent-test";
  return path.startsWith("/") ? path : `/${path}`;
}

export function getVoiceTestStreamWssUrl(): string {
  if (process.env.VOICE_MEDIA_STREAM_PROXY_VIA_APP === "1") {
    const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
    if (!base) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL is required when VOICE_MEDIA_STREAM_PROXY_VIA_APP=1",
      );
    }
    const wssBase = base
      .replace(/^https:\/\//i, "wss://")
      .replace(/^http:\/\//i, "wss://");
    return `${wssBase}${getVoiceTestStreamPath()}`;
  }

  const explicit = process.env.VOICE_TEST_STREAM_WSS_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const twilioUrl = getServerEnv().TWILIO_MEDIA_STREAM_WSS_URL?.trim();
  if (twilioUrl) {
    try {
      const parsed = new URL(twilioUrl);
      parsed.pathname = getVoiceTestStreamPath();
      return parsed.toString().replace(/\/$/, "");
    } catch {
      // fall through
    }
  }

  const port = getVoiceMediaStreamPort();
  return `ws://localhost:${port}${getVoiceTestStreamPath()}`;
}

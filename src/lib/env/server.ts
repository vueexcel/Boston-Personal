import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  /** Public anon key: browser + cookie-based server client (never use for privileged DB writes). */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  /** Default model for call summaries and auxiliary LLM tasks. */
  OPENAI_MODEL: z.string().min(1).optional(),
  PORTAL_TENANT_DISPLAY_ID: z.string().min(1).optional(),
  PORTAL_ACCOUNT_STATUS: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Parses and caches validated server-side environment variables (never exposed to the client).
 *
 * @returns Parsed environment subset used across services.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  cached = serverEnvSchema.parse(process.env);
  return cached;
}

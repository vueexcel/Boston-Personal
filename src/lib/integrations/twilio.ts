import twilio from "twilio";

type GlobalTwilio = typeof globalThis & {
  __bostelTwilio?: ReturnType<typeof twilio>;
};

/**
 * Returns a Twilio REST client using `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` from the environment.
 * Lazily constructed and reused across invocations.
 */
export function getTwilioClient(): ReturnType<typeof twilio> {
  const g = globalThis as GlobalTwilio;
  if (g.__bostelTwilio) {
    return g.__bostelTwilio;
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("Twilio credentials are not configured");
  }
  const client = twilio(sid, token);
  g.__bostelTwilio = client;
  return client;
}

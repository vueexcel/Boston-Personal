import { getTwilioClient } from "@/lib/integrations/twilio";

/**
 * Fetches Twilio call price metadata for the credits column.
 */
export async function fetchTwilioCallPrice(callSid: string): Promise<{
  price: string | null;
  priceUnit: string | null;
  duration: number | null;
}> {
  const client = getTwilioClient();
  const call = await client.calls(callSid).fetch();
  return {
    price: call.price ?? null,
    priceUnit: call.priceUnit ?? null,
    duration:
      call.duration != null && !Number.isNaN(Number(call.duration))
        ? Number(call.duration)
        : null,
  };
}

/**
 * Resolves a playable recording URL for a completed Twilio recording.
 */
export async function fetchTwilioRecordingMediaUrl(
  recordingSid: string,
): Promise<string | null> {
  const client = getTwilioClient();
  const recording = await client.recordings(recordingSid).fetch();
  const uri = recording.uri?.replace(/\.json$/, "") ?? null;
  if (!uri) return null;
  if (uri.startsWith("http")) return uri;
  return `https://api.twilio.com${uri}`;
}

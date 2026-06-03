import {
  fetchTwilioCallInsights,
  type TwilioCallInsights,
} from "@/lib/integrations/twilio-call-logs";
import { getTwilioClient } from "@/lib/integrations/twilio";

export type { TwilioCallInsights };

/**
 * Fetches Twilio call metadata for the credits column and call insights panel.
 */
export async function fetchTwilioCallPrice(callSid: string): Promise<{
  price: string | null;
  priceUnit: string | null;
  duration: number | null;
  insights: TwilioCallInsights | null;
}> {
  const insights = await fetchTwilioCallInsights(callSid);
  if (!insights) {
    return { price: null, priceUnit: null, duration: null, insights: null };
  }
  return {
    price: insights.price,
    priceUnit: insights.priceUnit,
    duration: insights.durationSeconds,
    insights,
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

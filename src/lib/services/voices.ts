import { getElevenLabsClient } from "@/lib/integrations/elevenlabs";

/**
 * Lists ElevenLabs voices available to this server integration (never expose keys to the client).
 */
export async function listVoicesForServer(): Promise<unknown> {
  const client = getElevenLabsClient();
  return client.voices.getAll({});
}

import { Queue } from "bullmq";
import { createBullmqConnection } from "@/lib/queue/connection";

const VOICE_EVENTS_QUEUE = "bostel:voice:events";

let voiceQueue: Queue | null = null;

/**
 * Returns the BullMQ queue used for asynchronous voice pipeline work (TTS, AI turns, etc.).
 *
 * @throws When `REDIS_URL` is not configured.
 */
export function getVoiceEventsQueue(): Queue {
  if (voiceQueue) return voiceQueue;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not configured");
  }
  voiceQueue = new Queue(VOICE_EVENTS_QUEUE, {
    connection: createBullmqConnection(url),
  });
  return voiceQueue;
}

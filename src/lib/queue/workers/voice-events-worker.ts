import { Worker, type Job } from "bullmq";
import { createBullmqConnection } from "@/lib/queue/connection";

export type VoiceEventJobData = {
  tenantId: string;
  callId: string;
  kind: "inbound_started" | "inbound_completed";
  recordedAtUtc: string;
};

/**
 * Registers a BullMQ worker that processes voice event jobs (extend with ElevenLabs / OpenAI steps).
 *
 * @param redisUrl - Redis connection string shared with producers.
 */
export function createVoiceEventsWorker(redisUrl: string): Worker {
  return new Worker<VoiceEventJobData>(
    "bostel:voice:events",
    async (job: Job<VoiceEventJobData>) => {
      // Placeholder: enqueue downstream AI/TTS here; never mix tenants across jobs.
      void job.id;
      void job.data.tenantId;
    },
    { connection: createBullmqConnection(redisUrl) },
  );
}

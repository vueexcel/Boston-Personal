import { createVoiceEventsWorker } from "./voice-events-worker";

/**
 * Long-running BullMQ worker entrypoint (run via `npm run worker`).
 * Loads `REDIS_URL` from the environment and blocks until interrupted.
 */
async function main(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not configured");
  }
  const worker = createVoiceEventsWorker(url);
  await new Promise<void>((resolve) => {
    worker.on("closed", () => resolve());
    process.on("SIGINT", () => {
      void worker.close();
    });
    process.on("SIGTERM", () => {
      void worker.close();
    });
  });
}

void main();

import { wssHost } from "@/lib/debug/agent-log";
import {
  getTwilioMediaStreamWssUrl,
  getVoiceMediaStreamPath,
  getVoiceMediaStreamPort,
} from "@/lib/env/server";
import { pingRedis } from "@/lib/health/redis-ping";
import {
  isMediaStreamProxiedViaApp,
  startTwilioMediaStreamServer,
} from "@/lib/voice/twilio-media-stream-server";
import { createVoiceEventsWorker } from "./voice-events-worker";

/**
 * Long-running BullMQ worker + Twilio Media Streams WebSocket (run via `npm run worker`).
 */
async function main(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not configured");
  }

  const redisPing = await pingRedis();
  if (!redisPing.ok) {
    throw new Error(`Redis unavailable: ${redisPing.error}`);
  }

  try {
    const wssUrl = getTwilioMediaStreamWssUrl();
    console.info("[bostel-voice] worker config", {
      localPort: getVoiceMediaStreamPort(),
      localPath: getVoiceMediaStreamPath(),
      publicWssHost: wssHost(wssUrl),
    });
    console.info(
      "[bostel-voice] Twilio must reach the public WSS host above — keep localtunnel/ngrok on port 3001 open during calls",
    );
  } catch (e) {
    console.error(
      "[bostel-voice] TWILIO_MEDIA_STREAM_WSS_URL missing or invalid",
      e instanceof Error ? e.message : e,
    );
  }

  if (isMediaStreamProxiedViaApp()) {
    console.info(
      "[bostel-voice] Skipping port 3001 media server — WebSocket is on Next dev server (VOICE_MEDIA_STREAM_PROXY_VIA_APP=1)",
    );
  } else {
    startTwilioMediaStreamServer();
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

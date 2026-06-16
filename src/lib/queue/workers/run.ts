import type { Worker } from "bullmq";
import { wssHost } from "@/lib/debug/agent-log";
import {
  getTwilioMediaStreamWssUrl,
  getVoiceMediaStreamPath,
  getVoiceMediaStreamPort,
} from "@/lib/env/server";
import { pingRedis } from "@/lib/health/redis-ping";
import {
  ensureBillingJobScheduler,
  isBillingJobsEnabled,
} from "@/lib/queue/billing-jobs-queue";
import {
  isMediaStreamProxiedViaApp,
  startTwilioMediaStreamServer,
} from "@/lib/voice/twilio-media-stream-server";
import { createBillingJobsWorker } from "./billing-jobs-worker";
import { createVoiceEventsWorker } from "./voice-events-worker";
import { getTtsConfigForProfile } from "@/lib/voice/tts-config";

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

  console.info("[bostel-voice] TTS config", {
    telephony: getTtsConfigForProfile("telephony"),
    browserTest: getTtsConfigForProfile("browser_test"),
  });

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

  const workers: Worker[] = [createVoiceEventsWorker(url)];

  if (isBillingJobsEnabled()) {
    if (!process.env.DATABASE_URL?.trim()) {
      throw new Error(
        "DATABASE_URL is required on the worker when billing jobs are enabled",
      );
    }
    await ensureBillingJobScheduler();
    workers.push(createBillingJobsWorker(url));
  } else {
    console.info(
      "[billing] jobs disabled (set BILLING_JOBS_ENABLED=1 and BILLING_CLOSE_PERIODS_CRON to enable)",
    );
  }

  await new Promise<void>((resolve) => {
    let closedCount = 0;
    const onWorkerClosed = () => {
      closedCount += 1;
      if (closedCount >= workers.length) {
        resolve();
      }
    };

    for (const worker of workers) {
      worker.on("closed", onWorkerClosed);
    }

    const shutdown = () => {
      void Promise.all(workers.map((worker) => worker.close()));
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

void main();

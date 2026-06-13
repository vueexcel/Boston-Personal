import { Worker, type Job } from "bullmq";
import { createBullmqConnection } from "@/lib/queue/connection";
import { VOICE_EVENTS_QUEUE } from "@/lib/queue/queues";
import { fetchTwilioCallPrice } from "@/lib/integrations/twilio-recordings";
import {
  extractCallCollectedInfo,
  extractExtraCallInformation,
  mergeExtraInformation,
} from "@/lib/services/call-collected-info";
import { parseExtraInformation } from "@/lib/services/call-metadata";
import { getAgentForTenant } from "@/lib/services/agents";
import {
  dispositionLabel,
  getMetadataString,
  parseTranscriptTurns,
} from "@/lib/services/call-metadata";
import {
  getCallLogByProviderId,
  updateCallLogByProviderId,
} from "@/lib/services/calls";
import { summarizeCall } from "@/lib/services/openai-agent";
import { resolveInfoToCollect } from "@/lib/services/twilio-call-agent";

export type VoiceEventJobData = {
  tenantId: string;
  callId: string;
  kind: "inbound_started" | "inbound_completed";
  recordedAtUtc: string;
};

async function processInboundCompleted(
  providerCallId: string,
  tenantId: string,
): Promise<void> {
  const row = await getCallLogByProviderId(providerCallId);
  if (!row || row.tenantId !== tenantId) return;

  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};

  let transcript =
    getMetadataString(meta, "transcript") ??
    "";
  if (!transcript.trim()) {
    const turns = parseTranscriptTurns(meta);
    transcript = turns
      .map((t) => `${t.role}: ${t.content}`)
      .join("\n");
  }

  const metadataPatch: Record<string, unknown> = {};
  const patch: {
    metadata: Record<string, unknown>;
    metadataMerge: boolean;
    summary?: string;
    disposition?: string;
    callMinutes?: number;
  } = {
    metadata: metadataPatch,
    metadataMerge: true,
  };

  try {
    const priceInfo = await fetchTwilioCallPrice(providerCallId);
    if (priceInfo.price) {
      metadataPatch.twilioPrice = priceInfo.price;
      metadataPatch.twilioPriceUnit = priceInfo.priceUnit;
    }
    if (priceInfo.insights) {
      metadataPatch.twilioInsights = priceInfo.insights;
    }
    const durationSec = row.duration ?? priceInfo.duration;
    if (durationSec != null && durationSec > 0) {
      patch.callMinutes = durationSec / 60;
    }
  } catch (e) {
    console.warn("[voice-events] Twilio price fetch failed", e);
    if (row.duration != null && row.duration > 0) {
      patch.callMinutes = row.duration / 60;
    }
  }

  patch.disposition = dispositionLabel(row.status, row.disposition);

  if (transcript.trim()) {
    try {
      const analysis = await summarizeCall(transcript);
      patch.summary = analysis.summary;
      metadataPatch.sentiment = analysis.sentiment;
      metadataPatch.actionItems = analysis.action_items;
    } catch (e) {
      console.error("[voice-events] summarize failed", e);
    }

    if (row.agentId) {
      try {
        const agent = await getAgentForTenant(tenantId, row.agentId);
        if (agent) {
          const infoToCollect = resolveInfoToCollect(agent);
          if (infoToCollect.length > 0) {
            const collectedInfo = await extractCallCollectedInfo(
              transcript,
              infoToCollect,
            );
            metadataPatch.collectedInfo = collectedInfo;
            metadataPatch.collectedInfoExtractedAt =
              new Date().toISOString();
          }
          try {
            const sessionExtras = parseExtraInformation(meta);
            const extracted = await extractExtraCallInformation(
              transcript,
              infoToCollect,
            );
            const merged = mergeExtraInformation(
              sessionExtras,
              extracted,
            );
            if (merged.length > 0) {
              metadataPatch.extraInformation = merged;
              metadataPatch.extraInformationExtractedAt =
                new Date().toISOString();
            }
          } catch (e) {
            console.error("[voice-events] extra-info extraction failed", e);
            const sessionExtras = parseExtraInformation(meta);
            if (sessionExtras.length > 0) {
              metadataPatch.extraInformation = sessionExtras;
            }
          }
        }
      } catch (e) {
        console.error("[voice-events] collected-info extraction failed", e);
      }
    }
  }

  await updateCallLogByProviderId(providerCallId, patch);
}

export function createVoiceEventsWorker(redisUrl: string): Worker {
  return new Worker<VoiceEventJobData>(
    VOICE_EVENTS_QUEUE,
    async (job: Job<VoiceEventJobData>) => {
      const { tenantId, callId, kind } = job.data;
      if (kind === "inbound_completed") {
        await processInboundCompleted(callId, tenantId);
      }
    },
    { connection: createBullmqConnection(redisUrl) },
  );
}

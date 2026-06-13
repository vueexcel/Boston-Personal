import { getRedis } from "@/lib/cache/redis";
import {
  buildTranscriptPlainText,
  buildTranscriptTurns,
} from "@/lib/services/call-metadata";
import {
  updateCallLogById,
  updateCallLogByProviderId,
} from "@/lib/services/calls";
import { fetchTwilioCallInsights } from "@/lib/integrations/twilio-call-logs";
import { enqueueInboundVoiceCompleted } from "@/lib/services/voice-events";
import { deleteCallSession, getCallSession } from "@/lib/voice/call-session";
import { agentDebugLog } from "@/lib/debug/agent-log";

const FINALIZE_KEY_PREFIX = "call:finalized:";
const FINALIZE_TTL_SEC = 86400;

export type FinalizeInboundCallInput = {
  providerCallId: string;
  status: "COMPLETED" | "FAILED" | "MISSED";
  twilioStatus?: string;
  durationSeconds?: number | null;
  /** When false, keep Redis session (e.g. status webhook will delete). */
  deleteSession?: boolean;
};

export type FinalizeInboundCallResult = {
  finalized: boolean;
  skippedReason?: "already_finalized" | "no_session_or_row";
  turnCount: number;
};

async function claimFinalization(providerCallId: string): Promise<boolean> {
  if (!process.env.REDIS_URL?.trim()) {
    return true;
  }
  try {
    const redis = getRedis();
    const key = `${FINALIZE_KEY_PREFIX}${providerCallId}`;
    const result = await redis.set(key, "1", "EX", FINALIZE_TTL_SEC, "NX");
    return result === "OK";
  } catch {
    return true;
  }
}

/**
 * Persists transcript/metadata and enqueues post-call summary (idempotent).
 */
export async function finalizeInboundCall(
  input: FinalizeInboundCallInput,
): Promise<FinalizeInboundCallResult> {
  const { providerCallId, status, twilioStatus, durationSeconds } = input;
  const deleteSession = input.deleteSession !== false;

  const claimed = await claimFinalization(providerCallId);
  if (!claimed) {
    agentDebugLog({
      location: "finalize-call.ts",
      message: "finalize skipped (already finalized)",
      hypothesisId: "H6",
      data: { callSidPrefix: providerCallId.slice(0, 10) },
    });
    return { finalized: false, skippedReason: "already_finalized", turnCount: 0 };
  }

  const session = await getCallSession(providerCallId);
  const transcriptTurns = session
    ? buildTranscriptTurns(session.messages)
    : [];
  const transcript = buildTranscriptPlainText(transcriptTurns);
  const turnCount = session?.turnCount ?? 0;

  let twilioInsights = null;
  try {
    twilioInsights = await fetchTwilioCallInsights(providerCallId);
  } catch {
    // non-fatal
  }

  const disposition =
    status === "COMPLETED"
      ? "Completed"
      : status === "MISSED"
        ? "Missed"
        : "Failed";

  const patch = {
    status,
    endedAt: new Date().toISOString(),
    duration: durationSeconds ?? twilioInsights?.durationSeconds ?? null,
    disposition,
    metadata: {
      ...(twilioStatus ? { twilioStatus } : {}),
      turnCount,
      transcript,
      transcriptTurns,
      ...(twilioInsights
        ? {
            twilioInsights,
            twilioPrice: twilioInsights.price,
            twilioPriceUnit: twilioInsights.priceUnit,
          }
        : {}),
      ...(session?.extraInformation?.length
        ? { extraInformation: session.extraInformation }
        : {}),
      ...(session?.conversationState
        ? { conversationState: session.conversationState }
        : {}),
    },
    metadataMerge: true as const,
  };

  try {
    if (session?.callLogId) {
      await updateCallLogById(session.callLogId, patch);
    } else {
      await updateCallLogByProviderId(providerCallId, patch);
    }
  } catch (e) {
    console.error("[finalize-call] update call_logs failed", e);
    return {
      finalized: false,
      skippedReason: "no_session_or_row",
      turnCount,
    };
  }

  if (session && process.env.REDIS_URL) {
    try {
      await enqueueInboundVoiceCompleted({
        tenantId: session.tenantId,
        callId: providerCallId,
      });
    } catch (e) {
      console.warn("[finalize-call] enqueue inbound_completed failed", e);
    }
  }

  if (deleteSession) {
    await deleteCallSession(providerCallId);
  }

  agentDebugLog({
    location: "finalize-call.ts",
    message: "call finalized",
    hypothesisId: "H6",
    data: {
      callSidPrefix: providerCallId.slice(0, 10),
      turnCount,
      transcriptTurns: transcriptTurns.length,
      status,
    },
  });

  if (process.env.DEBUG_VOICE === "1") {
    console.log("[bostel-voice] finalizeInboundCall", {
      callSidPrefix: providerCallId.slice(0, 10),
      turnCount,
      transcriptTurns: transcriptTurns.length,
    });
  }

  return { finalized: true, turnCount };
}

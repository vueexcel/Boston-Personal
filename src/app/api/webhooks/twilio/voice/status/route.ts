import { getTwilioSignatureUrl } from "@/lib/webhooks/request-url";
import {
  twilioFormDataToParams,
  verifyTwilioWebhookSignature,
} from "@/lib/webhooks/verify-twilio";
import {
  buildTranscriptPlainText,
  buildTranscriptTurns,
} from "@/lib/services/call-metadata";
import {
  getCallLogByProviderId,
  updateCallLogById,
  updateCallLogByProviderId,
  type CallLogPatch,
} from "@/lib/services/calls";
import { deleteCallSession, getCallSession } from "@/lib/voice/call-session";
import { enqueueInboundVoiceCompleted } from "@/lib/services/voice-events";
import { agentDebugLog } from "@/lib/debug/agent-log";

export const runtime = "nodejs";

function mapTwilioStatus(
  callStatus: string,
): "IN_PROGRESS" | "COMPLETED" | "FAILED" | "MISSED" | "INITIATED" {
  const s = callStatus.toLowerCase();
  if (s === "completed") return "COMPLETED";
  if (s === "in-progress" || s === "answered") return "IN_PROGRESS";
  if (s === "busy" || s === "failed" || s === "canceled" || s === "no-answer") {
    return s === "busy" || s === "no-answer" ? "MISSED" : "FAILED";
  }
  return "INITIATED";
}

/**
 * Twilio call status callback — updates call_logs and clears Redis session.
 */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const flat = twilioFormDataToParams(form);
  const signature = request.headers.get("x-twilio-signature");
  const url = getTwilioSignatureUrl(request);

  if (!verifyTwilioWebhookSignature(url, signature, flat)) {
    return new Response("Forbidden", { status: 403 });
  }

  const callSid = flat["CallSid"] ?? flat["ParentCallSid"];
  const callStatus = flat["CallStatus"] ?? "";
  if (!callSid) {
    return new Response("OK");
  }

  const mapped = mapTwilioStatus(callStatus);
  agentDebugLog({
    location: "voice/status/route.ts",
    message: "call status callback",
    hypothesisId: "H6",
    data: {
      callStatus,
      mapped,
      callSidPrefix: callSid.slice(0, 10),
    },
  });

  const durationRaw = flat["CallDuration"];
  const duration =
    durationRaw && !Number.isNaN(Number(durationRaw))
      ? Number(durationRaw)
      : null;

  try {
    const session = await getCallSession(callSid);
    const transcriptTurns = session
      ? buildTranscriptTurns(session.messages)
      : [];
    const transcript = buildTranscriptPlainText(transcriptTurns);

    const applyCallLogPatch = async (patch: CallLogPatch): Promise<void> => {
      if (session?.callLogId) {
        await updateCallLogById(session.callLogId, patch);
        return;
      }
      await updateCallLogByProviderId(callSid, patch);
    };

    if (mapped === "COMPLETED" || mapped === "FAILED" || mapped === "MISSED") {
      const existingBefore = session?.callLogId
        ? true
        : Boolean(await getCallLogByProviderId(callSid));
      // #region agent log
      fetch(
        "http://127.0.0.1:7522/ingest/6ccd5abb-3acd-4321-b624-ee504b3cedee",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "33b5f3",
          },
          body: JSON.stringify({
            sessionId: "33b5f3",
            location: "voice/status/route.ts:beforeUpdate",
            message: "status update call log",
            data: {
              callSidPrefix: callSid.slice(0, 10),
              mapped,
              hadCallLogRow: existingBefore,
              callLogIdPrefix: session?.callLogId?.slice(0, 8),
              turnCount: session?.turnCount ?? 0,
            },
            timestamp: Date.now(),
            hypothesisId: "H5",
          }),
        },
      ).catch(() => {});
      // #endregion
      await applyCallLogPatch({
        status: mapped,
        endedAt: new Date().toISOString(),
        duration,
        disposition:
          mapped === "COMPLETED"
            ? "Completed"
            : mapped === "MISSED"
              ? "Missed"
              : "Failed",
        metadata: {
          twilioStatus: callStatus,
          turnCount: session?.turnCount ?? 0,
          transcript,
          transcriptTurns,
        },
        metadataMerge: true,
      });

      if (session && process.env.REDIS_URL) {
        try {
          await enqueueInboundVoiceCompleted({
            tenantId: session.tenantId,
            callId: callSid,
          });
        } catch {
          // non-fatal
        }
      }

      await deleteCallSession(callSid);
    } else if (mapped === "IN_PROGRESS") {
      await applyCallLogPatch({
        status: "IN_PROGRESS",
      });
    }
  } catch (e) {
    console.error("[twilio/voice/status]", e);
  }

  return new Response("OK");
}

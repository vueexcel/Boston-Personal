import { getCallSession } from "@/lib/voice/call-session";
import { publishCallerUtterance } from "@/lib/voice/call-utterance-bridge";
import { getTwilioSignatureUrl } from "@/lib/webhooks/request-url";
import {
  isActionableCallerTranscript,
  parseTranscriptionData,
  parseTwilioTranscriptionWebhook,
} from "@/lib/webhooks/twilio-transcription";
import {
  twilioFormDataToParams,
  verifyTwilioWebhookSignature,
} from "@/lib/webhooks/verify-twilio";
import { agentDebugLog } from "@/lib/debug/agent-log";

export const runtime = "nodejs";

/**
 * Twilio Real-Time Transcription status callback.
 * Forwards partial and final inbound caller utterances to the media worker via Redis.
 */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const flat = twilioFormDataToParams(form);
  const signature = request.headers.get("x-twilio-signature");
  const url = getTwilioSignatureUrl(request);

  if (!verifyTwilioWebhookSignature(url, signature, flat)) {
    return new Response("Forbidden", { status: 403 });
  }

  const parsed = parseTwilioTranscriptionWebhook(flat);

  if (parsed.transcriptionEvent === "transcription-error") {
    agentDebugLog({
      location: "transcription/route.ts:error",
      message: "twilio transcription-error",
      hypothesisId: "H4",
      data: {
        event: parsed.transcriptionEvent,
        hasCallSid: Boolean(parsed.callSid),
      },
    });
    console.error("[twilio/voice/transcription] error", flat);
    return new Response("OK");
  }

  if (parsed.transcriptionEvent !== "transcription-content") {
    if (
      parsed.transcriptionEvent === "transcription-started" ||
      parsed.transcriptionEvent === "transcription-stopped"
    ) {
      agentDebugLog({
        location: "transcription/route.ts:session",
        message: parsed.transcriptionEvent,
        hypothesisId: "H1",
        data: {
          callSidPrefix: parsed.callSid?.slice(0, 10),
          track: parsed.track,
        },
      });
    }
    return new Response("OK");
  }

  if (parsed.track !== "inbound_track") {
    return new Response("OK");
  }

  const callSid = parsed.callSid;
  if (!callSid) {
    return new Response("OK");
  }

  const data = parseTranscriptionData(parsed.transcriptionDataRaw);
  if (!data || !isActionableCallerTranscript(data.transcript)) {
    return new Response("OK");
  }

  try {
    const session = await getCallSession(callSid);
    if (!session) {
      return new Response("OK");
    }

    await publishCallerUtterance(callSid, data.transcript, {
      final: parsed.final,
      stability: data.stability,
    });
  } catch (e) {
    console.error("[twilio/voice/transcription] publish failed", e);
  }

  return new Response("OK");
}

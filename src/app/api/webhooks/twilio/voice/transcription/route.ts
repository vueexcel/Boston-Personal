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
    // #region agent log
    fetch("http://127.0.0.1:7522/ingest/6ccd5abb-3acd-4321-b624-ee504b3cedee", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "33b5f3",
      },
      body: JSON.stringify({
        sessionId: "33b5f3",
        location: "transcription/route.ts:sig",
        message: "transcription signature rejected",
        data: { path: new URL(url).pathname },
        timestamp: Date.now(),
        hypothesisId: "H1",
      }),
    }).catch(() => {});
    // #endregion
    return new Response("Forbidden", { status: 403 });
  }

  const parsed = parseTwilioTranscriptionWebhook(flat);
  // #region agent log
  fetch("http://127.0.0.1:7522/ingest/6ccd5abb-3acd-4321-b624-ee504b3cedee", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "33b5f3",
    },
    body: JSON.stringify({
      sessionId: "33b5f3",
      location: "transcription/route.ts:entry",
      message: "transcription webhook received",
      data: {
        event: parsed.transcriptionEvent,
        track: parsed.track,
        final: parsed.final,
        callSidPrefix: parsed.callSid?.slice(0, 10),
        hasData: Boolean(parsed.transcriptionDataRaw),
      },
      timestamp: Date.now(),
      hypothesisId: "H1",
    }),
  }).catch(() => {});
  // #endregion

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
    // #region agent log
    fetch("http://127.0.0.1:7522/ingest/6ccd5abb-3acd-4321-b624-ee504b3cedee", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "33b5f3",
      },
      body: JSON.stringify({
        sessionId: "33b5f3",
        location: "transcription/route.ts:published",
        message: "utterance published to redis",
        data: {
          callSidPrefix: callSid.slice(0, 10),
          final: parsed.final,
          textLen: data.transcript.length,
          stability: data.stability,
        },
        timestamp: Date.now(),
        hypothesisId: "H3",
      }),
    }).catch(() => {});
    // #endregion
  } catch (e) {
    console.error("[twilio/voice/transcription] publish failed", e);
  }

  return new Response("OK");
}

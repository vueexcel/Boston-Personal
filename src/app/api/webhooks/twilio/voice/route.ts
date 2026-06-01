import { randomUUID } from "crypto";
import {
  inactiveTenantTwiML,
} from "@/lib/voice/twiml-fallback";
import { inboundMediaStreamTwiML, spokenMessageTwiML } from "@/lib/voice/twiml-stream";
import {
  getTwilioRecordingWebhookUrl,
  getTwilioTranscriptionWebhookUrl,
} from "@/lib/webhooks/twilio-app-url";
import { getTwilioSignatureUrl } from "@/lib/webhooks/request-url";
import {
  twilioFormDataToParams,
  verifyTwilioWebhookSignature,
} from "@/lib/webhooks/verify-twilio";
import {
  inboundRouteFailureMessage,
  resolveInboundCallDetailed,
} from "@/lib/services/phone-routing";
import { normalizeInboundToE164 } from "@/lib/utils/phone-format";
import { createCallRecordTransact } from "@/lib/services/calls";
import { loadCallAgentContext } from "@/lib/services/twilio-call-agent";
import { createCallSession } from "@/lib/voice/call-session";
import { getTwilioMediaStreamWssUrl } from "@/lib/env/server";
import {
  agentDebugLog,
  isLocalOrPrivateWss,
  wssHost,
} from "@/lib/debug/agent-log";

function twimlResponse(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export const runtime = "nodejs";

/**
 * Twilio Voice inbound webhook. Verifies signature, routes by `To`, starts Media Stream.
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const form = await request.formData();
  const flat = twilioFormDataToParams(form);
  const signature = request.headers.get("x-twilio-signature");
  const url = getTwilioSignatureUrl(request);
  const callSid = flat["CallSid"] ?? flat["ParentCallSid"];

  const finish = (
    outcome: string,
    extra?: Record<string, unknown>,
  ): void => {
    const elapsedMs = Date.now() - startedAt;
    const summary = {
      outcome,
      elapsedMs,
      callSidPrefix: callSid?.slice(0, 10),
      ...extra,
    };
    console.log("[bostel-voice] voice/webhook done", summary);
    if (elapsedMs > 12_000) {
      console.warn(
        "[bostel-voice] webhook slow (>12s) — Twilio may play application error even if status is 200",
        summary,
      );
    }
  };

  const sigOk = verifyTwilioWebhookSignature(url, signature, flat);
  if (!sigOk) {
    // #region agent log
    agentDebugLog({
      location: "voice/route.ts:sig",
      message: "signature rejected",
      hypothesisId: "H1",
      data: { webhookHost: wssHost(url.replace(/^http/, "https")) },
    });
    // #endregion
    finish("forbidden");
    return new Response("Forbidden", { status: 403 });
  }

  const to = flat["To"];
  const from = flat["From"] ?? "unknown";
  // #region agent log
  agentDebugLog({
    location: "voice/route.ts:entry",
    message: "voice webhook accepted",
    hypothesisId: "H1",
    data: {
      hasCallSid: Boolean(callSid),
      hasTo: Boolean(to),
      webhookPath: new URL(url).pathname,
    },
  });
  // #endregion
  if (!to) {
    finish("no-to");
    return twimlResponse(inactiveTenantTwiML("Unable to route this call."));
  }

  let routeResult;
  try {
    routeResult = await resolveInboundCallDetailed(to, from);
  } catch (e) {
    const message = e instanceof Error ? e.message : "route threw";
    finish("route-exception", { error: message });
    return twimlResponse(
      spokenMessageTwiML(
        "This line is temporarily unavailable. Please try again later.",
      ),
    );
  }

  if (!routeResult.ok || !callSid) {
    const reason = routeResult.ok ? "db_error" : routeResult.reason;
    // #region agent log
    agentDebugLog({
      location: "voice/route.ts:route",
      message: "inbound not routed",
      hypothesisId: "H2",
      data: {
        routeOk: routeResult.ok,
        reason,
        hasCallSid: Boolean(callSid),
        toSuffix: normalizeInboundToE164(to).slice(-4),
      },
    });
    // #endregion
    finish("route-failed", { reason });
    return twimlResponse(spokenMessageTwiML(inboundRouteFailureMessage(reason)));
  }

  const resolution = routeResult.resolution;

  try {
    const agentSnapshot = await loadCallAgentContext(
      resolution.tenantId,
      resolution.agentId,
    );

    const callLogId = randomUUID();
    await createCallSession({
      callSid,
      tenantId: resolution.tenantId,
      agentId: resolution.agentId,
      callLogId,
      callerNumber: from,
      dialedNumber: resolution.e164Number,
      messages: [],
      turnCount: 0,
      startedAt: new Date().toISOString(),
      agentSnapshot,
      greetingPlayed: false,
    });

    try {
      const callLogResult = await createCallRecordTransact({
        tenantId: resolution.tenantId,
        callId: callLogId,
        providerCallId: callSid,
        callerNumber: from,
        dialedNumber: resolution.e164Number,
        agentId: resolution.agentId,
      });
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
            location: "voice/route.ts:callLog",
            message: callLogResult.created
              ? "call_logs insert ok"
              : "call_logs insert duplicate",
            data: {
              callSidPrefix: callSid.slice(0, 10),
              callLogIdPrefix: callLogId.slice(0, 8),
              tenantIdPrefix: resolution.tenantId.slice(0, 8),
              created: callLogResult.created,
              duplicate: callLogResult.duplicate,
            },
            timestamp: Date.now(),
            hypothesisId: "H5",
          }),
        },
      ).catch(() => {});
      // #endregion
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "call log failed";
      console.error("[bostel-voice] createCallRecordTransact", message);
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
            location: "voice/route.ts:callLog",
            message: "call_logs insert failed",
            data: {
              callSidPrefix: callSid.slice(0, 10),
              error: message,
              fromSuffix: from.slice(-4),
            },
            timestamp: Date.now(),
            hypothesisId: "H5",
          }),
        },
      ).catch(() => {});
      // #endregion
    }

    const streamUrl = getTwilioMediaStreamWssUrl();
    const transcriptionUrl = getTwilioTranscriptionWebhookUrl();
    const recordingUrl = getTwilioRecordingWebhookUrl();
    const twiml = inboundMediaStreamTwiML({
      streamUrl,
      transcriptionCallbackUrl: transcriptionUrl,
      recordingCallbackUrl: recordingUrl,
      languageCode: agentSnapshot.sttLanguage,
    });
    // #region agent log
    agentDebugLog({
      location: "voice/route.ts:twiml",
      message: "returning media stream TwiML",
      hypothesisId: "H3",
      data: {
        streamHost: wssHost(streamUrl),
        streamIsLocal: isLocalOrPrivateWss(streamUrl),
        transcriptionHost: wssHost(transcriptionUrl.replace(/^http/, "https")),
        sttLanguage: agentSnapshot.sttLanguage,
        twimlBytes: twiml.length,
        agentIdPrefix: resolution.agentId.slice(0, 8),
      },
    });
    // #endregion
    finish("twiml-media-stream", {
      streamHost: wssHost(streamUrl),
      streamIsLocal: isLocalOrPrivateWss(streamUrl),
    });
    return twimlResponse(twiml);
  } catch (e) {
    const message =
      e instanceof Error
        ? e.message
        : "Unable to start the voice agent.";
    // #region agent log
    agentDebugLog({
      location: "voice/route.ts:catch",
      message: "voice handler error",
      hypothesisId: "H4",
      data: { error: message },
    });
    // #endregion
    console.error("[twilio/voice]", message);
    finish("handler-error", { error: message });
    return twimlResponse(
      spokenMessageTwiML(
        "We could not connect your call to the voice agent. Please try again later.",
      ),
    );
  }
}

import { getTwilioSignatureUrl } from "@/lib/webhooks/request-url";
import {
  twilioFormDataToParams,
  verifyTwilioWebhookSignature,
} from "@/lib/webhooks/verify-twilio";
import { updateCallLogByProviderId } from "@/lib/services/calls";
import { finalizeInboundCall } from "@/lib/voice/finalize-call";
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
    if (mapped === "COMPLETED" || mapped === "FAILED" || mapped === "MISSED") {
      await finalizeInboundCall({
        providerCallId: callSid,
        status: mapped,
        twilioStatus: callStatus,
        durationSeconds: duration,
        deleteSession: true,
      });
    } else if (mapped === "IN_PROGRESS") {
      await updateCallLogByProviderId(callSid, {
        status: "IN_PROGRESS",
      });
    }
  } catch (e) {
    console.error("[twilio/voice/status]", e);
  }

  return new Response("OK");
}

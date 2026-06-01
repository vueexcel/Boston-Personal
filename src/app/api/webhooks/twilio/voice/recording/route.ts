import { getTwilioSignatureUrl } from "@/lib/webhooks/request-url";
import {
  twilioFormDataToParams,
  verifyTwilioWebhookSignature,
} from "@/lib/webhooks/verify-twilio";
import { updateCallLogByProviderId } from "@/lib/services/calls";

export const runtime = "nodejs";

/**
 * Twilio Recording status callback — stores recording URL on call_logs.
 */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const flat = twilioFormDataToParams(form);
  const signature = request.headers.get("x-twilio-signature");
  const url = getTwilioSignatureUrl(request);

  if (!verifyTwilioWebhookSignature(url, signature, flat)) {
    return new Response("Forbidden", { status: 403 });
  }

  const recordingStatus = (flat["RecordingStatus"] ?? "").toLowerCase();
  if (recordingStatus !== "completed") {
    return new Response("OK");
  }

  const callSid = flat["CallSid"] ?? flat["ParentCallSid"];
  const recordingUrl = flat["RecordingUrl"];
  const recordingSid = flat["RecordingSid"];

  if (!callSid) {
    return new Response("OK");
  }

  try {
    await updateCallLogByProviderId(callSid, {
      recordingUrl: recordingUrl?.trim() || null,
      metadata: {
        recordingSid: recordingSid ?? null,
      },
      metadataMerge: true,
    });
  } catch (e) {
    console.error("[twilio/voice/recording]", e);
  }

  return new Response("OK");
}

import {
  activeTenantStubTwiML,
  inactiveTenantTwiML,
} from "@/lib/voice/twiml-fallback";
import { getTwilioWebhookPublicUrl } from "@/lib/webhooks/request-url";
import {
  twilioFormDataToParams,
  verifyTwilioWebhookSignature,
} from "@/lib/webhooks/verify-twilio";
import { resolveTenantIdByInboundPhone } from "@/lib/services/phone-routing";
import { isTenantActive } from "@/lib/services/tenant";
import { enqueueInboundVoiceStarted } from "@/lib/services/voice-events";

function twimlResponse(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/**
 * Twilio Voice status / inbound webhook. Verifies signature, routes by `To`, and
 * sends inactive tenants to fallback TwiML (never live agents).
 */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const flat = twilioFormDataToParams(form);
  const signature = request.headers.get("x-twilio-signature");
  const url = getTwilioWebhookPublicUrl(request);

  if (!verifyTwilioWebhookSignature(url, signature, flat)) {
    return new Response("Forbidden", { status: 403 });
  }

  const to = flat["To"];
  const callSid = flat["CallSid"] ?? flat["ParentCallSid"];
  if (!to) {
    return twimlResponse(inactiveTenantTwiML("Unable to route this call."));
  }

  const tenantId = await resolveTenantIdByInboundPhone(to);
  if (!tenantId) {
    return twimlResponse(
      inactiveTenantTwiML("This number is not provisioned for Bostel Voice AI."),
    );
  }

  const active = await isTenantActive(tenantId);
  if (!active) {
    return twimlResponse(inactiveTenantTwiML());
  }

  if (callSid && process.env.REDIS_URL) {
    try {
      await enqueueInboundVoiceStarted({ tenantId, callId: callSid });
    } catch {
      // Non-fatal: caller still receives TwiML; monitor queue health separately.
    }
  }

  return twimlResponse(activeTenantStubTwiML(tenantId));
}

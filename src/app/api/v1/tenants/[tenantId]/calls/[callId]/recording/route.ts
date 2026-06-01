import { z } from "zod";
import { errEnvelope, jsonEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { fetchTwilioRecordingMediaUrl } from "@/lib/integrations/twilio-recordings";
import { getCallDetailForTenant } from "@/lib/services/calls";
import { getMetadataString } from "@/lib/services/call-metadata";
import { tenantIdSchema } from "@/lib/validation/tenant-id";

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
  callId: tenantIdSchema,
});

/**
 * Proxies Twilio call recording audio (credentials stay server-side).
 */
export async function GET(
  _request: Request,
  context: {
    params:
      | Promise<{ tenantId: string; callId: string }>
      | { tenantId: string; callId: string };
  },
): Promise<Response> {
  const paramsIn =
    "then" in context.params ? await context.params : context.params;
  const parsed = paramsSchema.safeParse(paramsIn);
  if (!parsed.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid parameters",
      }),
      { status: 400 },
    );
  }

  const authz = await requireTenantApiAccess(parsed.data.tenantId);
  if (!authz.ok) return authz.response;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return jsonEnvelope(
      errEnvelope({
        code: "CONFIG_ERROR",
        message: "Twilio is not configured",
      }),
      { status: 503 },
    );
  }

  try {
    const call = await getCallDetailForTenant(
      parsed.data.tenantId,
      parsed.data.callId,
    );
    if (!call) {
      return jsonEnvelope(
        errEnvelope({ code: "NOT_FOUND", message: "Call not found" }),
        { status: 404 },
      );
    }

    let mediaUrl = call.recordingUrl?.trim() || null;
    const meta =
      call.metadata && typeof call.metadata === "object"
        ? (call.metadata as Record<string, unknown>)
        : null;
    const recordingSid = getMetadataString(meta, "recordingSid");

    if (!mediaUrl && recordingSid) {
      mediaUrl = await fetchTwilioRecordingMediaUrl(recordingSid);
    }

    if (!mediaUrl) {
      return jsonEnvelope(
        errEnvelope({
          code: "NOT_FOUND",
          message: "No recording available for this call",
        }),
        { status: 404 },
      );
    }

    const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const twilioRes = await fetch(mediaUrl, {
      headers: { Authorization: `Basic ${basic}` },
    });

    if (!twilioRes.ok) {
      return jsonEnvelope(
        errEnvelope({
          code: "UPSTREAM_ERROR",
          message: "Failed to fetch recording from Twilio",
        }),
        { status: 502 },
      );
    }

    const contentType =
      twilioRes.headers.get("content-type") ?? "audio/mpeg";

    return new Response(twilioRes.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return jsonEnvelope(
      errEnvelope({ code: "DATASTORE_ERROR", message }),
      { status: 503 },
    );
  }
}

import { z } from "zod";
import { errEnvelope, jsonEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { synthesizePortalVoicePreview } from "@/lib/services/elevenlabs-preview";
import { tenantIdSchema } from "@/lib/validation/tenant-id";

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
});

const bodySchema = z.object({
  voiceId: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid voice id"),
});

/**
 * POST JSON `{ voiceId }` → MP3 body for in-browser preview (same auth as voices list).
 */
export async function POST(
  request: Request,
  context: {
    params: Promise<{ tenantId: string }> | { tenantId: string };
  },
): Promise<Response> {
  const paramsIn =
    "then" in context.params ? await context.params : context.params;
  const parsedParams = paramsSchema.safeParse(paramsIn);
  if (!parsedParams.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid tenant id",
        details: parsedParams.error.flatten(),
      }),
      { status: 400 },
    );
  }

  const { tenantId } = parsedParams.data;
  const authz = await requireTenantApiAccess(tenantId);
  if (!authz.ok) return authz.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Expected JSON body with voiceId",
      }),
      { status: 400 },
    );
  }

  const parsedBody = bodySchema.safeParse(json);
  if (!parsedBody.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid body",
        details: parsedBody.error.flatten(),
      }),
      { status: 400 },
    );
  }

  const result = await synthesizePortalVoicePreview(parsedBody.data.voiceId);
  if (!result.ok) {
    return jsonEnvelope(
      errEnvelope({
        code: "ELEVENLABS_PREVIEW_FAILED",
        message: result.error,
      }),
      { status: result.status ?? 502 },
    );
  }

  return new Response(new Uint8Array(result.body), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "no-store",
    },
  });
}

import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { verifyElevenLabsStyleWebhook } from "@/lib/webhooks/verify-elevenlabs";

const payloadSchema = z.object({
  type: z.string().min(1),
});

/**
 * ElevenLabs-compatible webhook receiver. Rejects unsigned or invalid payloads before side effects.
 */
export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();

  if (!verifyElevenLabsStyleWebhook(raw, request.headers)) {
    return jsonEnvelope(
      errEnvelope({ code: "UNAUTHORIZED", message: "Invalid webhook signature" }),
      { status: 401 },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    return jsonEnvelope(
      errEnvelope({ code: "INVALID_JSON", message: "Body must be JSON" }),
      { status: 400 },
    );
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid payload",
        details: parsed.error.flatten(),
      }),
      { status: 400 },
    );
  }

  return jsonEnvelope(
    okEnvelope({
      received: true,
      type: parsed.data.type,
      recordedAtUtc: new Date().toISOString(),
    }),
  );
}

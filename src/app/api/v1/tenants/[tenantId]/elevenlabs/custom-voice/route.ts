import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { createElevenLabsInstantVoiceClone } from "@/lib/services/elevenlabs-custom-voice";
import { tenantIdSchema } from "@/lib/validation/tenant-id";

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
});

const nameSchema = z
  .string()
  .min(1, "Name is required")
  .max(100, "Name is too long");

const MAX_BYTES = 20 * 1024 * 1024;

function isAllowedAudio(file: File, buf: Buffer): boolean {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("audio/")) return true;
  const n = (file.name || "").toLowerCase();
  return /\.(mp3|wav|m4a|webm|ogg|flac|aac)$/i.test(n) && buf.length > 0;
}

/**
 * multipart/form-data: `name` (string), `sample` (File) — instant voice clone (IVC).
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Expected multipart form data",
      }),
      { status: 400 },
    );
  }

  const rawName = formData.get("name");
  const sample = formData.get("sample");

  const parsedName = nameSchema.safeParse(
    typeof rawName === "string" ? rawName : "",
  );
  if (!parsedName.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid name",
        details: parsedName.error.flatten(),
      }),
      { status: 400 },
    );
  }

  if (!(sample instanceof File)) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Missing audio file field `sample`",
      }),
      { status: 400 },
    );
  }

  const buf = Buffer.from(await sample.arrayBuffer());
  if (buf.length === 0) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Empty audio file",
      }),
      { status: 400 },
    );
  }
  if (buf.length > MAX_BYTES) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: `Audio file must be at most ${MAX_BYTES / (1024 * 1024)} MB`,
      }),
      { status: 400 },
    );
  }

  if (!isAllowedAudio(sample, buf)) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message:
          "Unsupported file type. Use a common audio format (MP3, WAV, M4A, WebM, etc.).",
      }),
      { status: 400 },
    );
  }

  const result = await createElevenLabsInstantVoiceClone({
    displayName: parsedName.data,
    sample: buf,
    filename: sample.name || "sample.mp3",
    mimeType: sample.type || "application/octet-stream",
  });

  if (!result.ok) {
    return jsonEnvelope(
      errEnvelope({
        code: "ELEVENLABS_VOICE_CREATE_FAILED",
        message: result.error,
      }),
      { status: 502 },
    );
  }

  return jsonEnvelope(
    okEnvelope({
      voiceId: result.voiceId,
      requiresVerification: result.requiresVerification,
    }),
  );
}

import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { createKnowledgeBaseFromFile } from "@/lib/services/knowledge-bases";
import {
  KnowledgeFileExtractionError,
} from "@/lib/services/knowledge-file-extraction";
import {
  KB_FILE_MAX_BYTES,
  KnowledgeFileParseError,
} from "@/lib/services/knowledge-file-parser";
import { ContentSafetyViolationError } from "@/lib/services/prompt-content-safety";
import { tenantIdSchema } from "@/lib/validation/tenant-id";

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
});

const nameSchema = z.string().trim().min(1).max(200).optional();

/**
 * multipart/form-data: `file` (required), `name` (optional string).
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
  const fileField = formData.get("file");

  const parsedName = nameSchema.safeParse(
    typeof rawName === "string" && rawName.trim() ? rawName : undefined,
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

  if (!(fileField instanceof File)) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "A file is required",
      }),
      { status: 400 },
    );
  }

  const arrayBuffer = await fileField.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > KB_FILE_MAX_BYTES) {
    return jsonEnvelope(
      errEnvelope({
        code: "FILE_TOO_LARGE",
        message: `File must be ${KB_FILE_MAX_BYTES / (1024 * 1024)} MB or smaller`,
      }),
      { status: 400 },
    );
  }

  try {
    const knowledgeBase = await createKnowledgeBaseFromFile(tenantId, {
      buffer,
      fileName: fileField.name || "upload",
      mimeType: fileField.type || "application/octet-stream",
      name: parsedName.data,
    });
    return jsonEnvelope(okEnvelope({ knowledgeBase }), { status: 201 });
  } catch (e) {
    if (e instanceof KnowledgeFileParseError) {
      return jsonEnvelope(
        errEnvelope({
          code: e.code,
          message: e.message,
        }),
        { status: 400 },
      );
    }
    if (e instanceof KnowledgeFileExtractionError) {
      return jsonEnvelope(
        errEnvelope({
          code: "EXTRACTION_FAILED",
          message: e.message,
        }),
        { status: 422 },
      );
    }
    if (e instanceof ContentSafetyViolationError) {
      return jsonEnvelope(
        errEnvelope({
          code: e.code,
          message: e.message,
          details: { issues: e.issues },
        }),
        { status: 400 },
      );
    }
    const message = e instanceof Error ? e.message : "Unexpected error";
    const isOpenAi =
      message.includes("OPENAI") ||
      message.toLowerCase().includes("openai") ||
      message.includes("rate limit");
    return jsonEnvelope(
      errEnvelope({
        code: isOpenAi ? "OPENAI_ERROR" : "DATASTORE_ERROR",
        message,
      }),
      { status: isOpenAi ? 502 : 503 },
    );
  }
}

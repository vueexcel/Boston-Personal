import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { createKnowledgeBaseFromWebsite } from "@/lib/services/knowledge-bases";
import { KnowledgeFileExtractionError } from "@/lib/services/knowledge-file-extraction";
import { ContentSafetyViolationError } from "@/lib/services/prompt-content-safety";
import { WebsiteScrapeError } from "@/lib/services/website-scraper";
import { tenantIdSchema } from "@/lib/validation/tenant-id";

export const maxDuration = 300;

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
});

const bodySchema = z.object({
  url: z.string().trim().url("A valid website URL is required"),
  name: z.string().trim().min(1).max(200).optional(),
});

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonEnvelope(
      errEnvelope({ code: "INVALID_JSON", message: "Body must be JSON" }),
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid request body",
        details: parsed.error.flatten(),
      }),
      { status: 400 },
    );
  }

  try {
    const knowledgeBase = await createKnowledgeBaseFromWebsite(tenantId, {
      url: parsed.data.url,
      name: parsed.data.name,
    });
    return jsonEnvelope(okEnvelope({ knowledgeBase }), { status: 201 });
  } catch (e) {
    if (e instanceof WebsiteScrapeError) {
      return jsonEnvelope(
        errEnvelope({
          code: "SCRAPE_FAILED",
          message: e.message,
        }),
        { status: e.code === "INVALID_URL" ? 400 : 422 },
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

import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { listCallsForTenant } from "@/lib/services/calls";
import { tenantIdSchema } from "@/lib/validation/tenant-id";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
});

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
});

/**
 * Lists call records for a single tenant (Postgres `call_logs` scoped by `tenant_id`).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ tenantId: string }> | { tenantId: string } },
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

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  if (!parsedQuery.success) {
    return jsonEnvelope(
      errEnvelope({
        code: "VALIDATION_ERROR",
        message: "Invalid query parameters",
        details: parsedQuery.error.flatten(),
      }),
      { status: 400 },
    );
  }

  const { tenantId } = parsedParams.data;
  const { limit, cursor } = parsedQuery.data;

  try {
    const { calls, nextCursor } = await listCallsForTenant(
      tenantId,
      limit,
      cursor,
    );
    return jsonEnvelope(
      okEnvelope({
        tenantId,
        calls,
        nextCursor,
      }),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return jsonEnvelope(
      errEnvelope({
        code: "DATASTORE_ERROR",
        message,
      }),
      { status: 503 },
    );
  }
}

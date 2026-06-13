import { z } from "zod";
import { okEnvelope, jsonEnvelope } from "@/lib/api/response";
import { requirePlatformAdminApi } from "@/lib/auth/platform-access";
import { tenantStatusSchema } from "@/lib/db/enums";
import { listPlatformTenants } from "@/lib/services/platform-tenants";

const querySchema = z.object({
  search: z.string().optional(),
  status: tenantStatusSchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const auth = await requirePlatformAdminApi();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    search: url.searchParams.get("search") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return jsonEnvelope(
      { success: false, data: null, error: { code: "BAD_REQUEST", message: "Invalid query" } },
      { status: 400 },
    );
  }

  const result = await listPlatformTenants(parsed.data);
  return jsonEnvelope(okEnvelope(result));
}

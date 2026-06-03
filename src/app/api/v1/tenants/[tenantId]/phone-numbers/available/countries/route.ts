import { z } from "zod";
import { errEnvelope, jsonEnvelope, okEnvelope } from "@/lib/api/response";
import { requireTenantApiAccess } from "@/lib/auth/tenant-access";
import { listAvailablePhoneNumberCountries } from "@/lib/integrations/twilio-phone-numbers";
import { tenantIdSchema } from "@/lib/validation/tenant-id";

const paramsSchema = z.object({
  tenantId: tenantIdSchema,
});

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ tenantId: string }> | { tenantId: string };
  },
): Promise<Response> {
  const paramsIn =
    "then" in context.params ? await context.params : context.params;
  const parsedParams = paramsSchema.safeParse(paramsIn);
  if (!parsedParams.success) {
    return jsonEnvelope(
      errEnvelope({ code: "VALIDATION_ERROR", message: "Invalid tenant id" }),
      { status: 400 },
    );
  }

  const { tenantId } = parsedParams.data;
  const authz = await requireTenantApiAccess(tenantId);
  if (!authz.ok) return authz.response;

  try {
    const countries = await listAvailablePhoneNumberCountries();
    return jsonEnvelope(okEnvelope({ countries }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    const status = message.includes("not configured") ? 503 : 502;
    return jsonEnvelope(
      errEnvelope({ code: "TWILIO_ERROR", message }),
      { status },
    );
  }
}
